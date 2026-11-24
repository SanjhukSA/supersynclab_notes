"""
Google Sync router — Google Drive & Classroom discovery and note intake.

Endpoints:
- GET  /api/v1/integrations/google/status
- GET  /api/v1/integrations/google/drive/browse
- GET  /api/v1/integrations/google/classroom/courses
- GET  /api/v1/integrations/google/classroom/courses/{course_id}/materials
- POST /api/v1/integrations/google/import
"""

import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_db
from deps import CurrentUser
from schemas.google_sync import (
    GoogleClassroomCourse,
    GoogleClassroomMaterial,
    GoogleConnectionStatus,
    GoogleDriveBrowseResponse,
    GoogleImportRequest,
    GoogleImportResponse,
)
from schemas.notes import NoteResponse
from services.google_sync import google_sync_service
from services.ingestion import ingestion_service

router = APIRouter()


def _resolve_token(
    header_token: str | None,
    query_token: str | None = None,
    body_token: str | None = None,
) -> str | None:
    token = header_token or query_token or body_token
    if token and token.startswith("Bearer "):
        token = token[7:]
    return token.strip() if token else None


@router.get(
    "/status",
    response_model=GoogleConnectionStatus,
    summary="Check Google Drive & Classroom connection status",
)
async def get_google_status(
    user: CurrentUser,
    x_google_access_token: str | None = Header(None),
    access_token: str | None = Query(None),
) -> GoogleConnectionStatus:
    token = _resolve_token(x_google_access_token, access_token)
    return await google_sync_service.get_connection_status(user, token)


@router.get(
    "/drive/browse",
    response_model=GoogleDriveBrowseResponse,
    summary="Browse folders and files in Google Drive",
)
async def browse_drive(
    user: CurrentUser,
    folder_id: str = Query("root"),
    query: str | None = Query(None),
    page_token: str | None = Query(None),
    x_google_access_token: str | None = Header(None),
    access_token: str | None = Query(None),
) -> GoogleDriveBrowseResponse:
    token = _resolve_token(x_google_access_token, access_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "missing_google_token",
                "message": "Google Access Token required to browse Drive.",
            },
        )
    return await google_sync_service.browse_drive(
        access_token=token,
        folder_id=folder_id,
        query=query,
        page_token=page_token,
    )


@router.get(
    "/classroom/courses",
    response_model=list[GoogleClassroomCourse],
    summary="List student's active courses from Google Classroom",
)
async def list_classroom_courses(
    user: CurrentUser,
    x_google_access_token: str | None = Header(None),
    access_token: str | None = Query(None),
) -> list[GoogleClassroomCourse]:
    token = _resolve_token(x_google_access_token, access_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "missing_google_token",
                "message": "Google Access Token required to access Classroom.",
            },
        )
    return await google_sync_service.list_classroom_courses(token)


@router.get(
    "/classroom/courses/{course_id}/materials",
    response_model=list[GoogleClassroomMaterial],
    summary="List materials & assignments for a Classroom course",
)
async def list_classroom_materials(
    course_id: str,
    user: CurrentUser,
    x_google_access_token: str | None = Header(None),
    access_token: str | None = Query(None),
) -> list[GoogleClassroomMaterial]:
    token = _resolve_token(x_google_access_token, access_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "missing_google_token",
                "message": "Google Access Token required to access Classroom materials.",
            },
        )
    return await google_sync_service.list_classroom_materials(token, course_id)


@router.post(
    "/import",
    response_model=GoogleImportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Download and import real Google Drive files into notes library",
)
async def import_google_items(
    req: GoogleImportRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    x_google_access_token: str | None = Header(None),
) -> GoogleImportResponse:
    token = _resolve_token(x_google_access_token, body_token=req.access_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "missing_google_token",
                "message": "Google Access Token required to download Drive files.",
            },
        )

    target_folder_id = req.folder_id
    if req.create_subfolder and req.subfolder_name:
        subfolder = await google_sync_service.create_folder_for_import(
            name=req.subfolder_name,
            user_id=user.id,
            parent_id=req.folder_id,
            db=db,
        )
        target_folder_id = subfolder.id

    imported_notes = []
    for item in req.items:
        note = await google_sync_service.import_item(
            item=item,
            user_id=user.id,
            folder_id=target_folder_id,
            access_token=token,
        )
        db.add(note)
        imported_notes.append(note)

    await db.commit()

    # Trigger background ingestion for all imported notes
    for note in imported_notes:
        await db.refresh(note)
        asyncio.create_task(ingestion_service.process_note(note.id))

    return GoogleImportResponse(
        imported_count=len(imported_notes),
        notes=[NoteResponse.model_validate(n) for n in imported_notes],
        message=(
            f"Successfully downloaded {len(imported_notes)} documents from Google. "
            "Ingestion and high-res page extraction started in background."
        ),
    )
