"""
Folders router — create, list, rename, and delete organizational folders.

All endpoints require authentication (Clerk session token) and are scoped
strictly to the authenticated user.
"""

import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Folder, Note
from db.session import get_db
from deps import CurrentUser
from schemas.folders import (
    FolderCreateRequest,
    FolderDetailResponse,
    FolderListResponse,
    FolderResponse,
    FolderUpdateRequest,
)

router = APIRouter()


@router.post(
    "",
    response_model=FolderDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new folder",
)
async def create_folder(
    req: FolderCreateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> FolderDetailResponse:
    """Create a folder owned by the authenticated user."""
    # If parent_id specified, ensure parent belongs to user
    if req.parent_id:
        parent_stmt = select(Folder).where(Folder.id == req.parent_id, Folder.owner_id == user.id)
        parent_res = await db.execute(parent_stmt)
        if not parent_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "parent_not_found", "message": "Parent folder not found"},
            )

    folder = Folder(
        id=uuid.uuid4(),
        owner_id=user.id,
        name=req.name.strip(),
        parent_id=req.parent_id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    response_data = FolderResponse(
        id=folder.id,
        owner_id=folder.owner_id,
        name=folder.name,
        parent_id=folder.parent_id,
        note_count=0,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )
    return FolderDetailResponse(data=response_data)


@router.get(
    "",
    response_model=FolderListResponse,
    summary="List all folders owned by the current user",
)
async def list_folders(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> FolderListResponse:
    """Retrieve all folders for current user with accurate note counts."""
    # Query folders
    stmt = select(Folder).where(Folder.owner_id == user.id).order_by(Folder.name.asc())
    result = await db.execute(stmt)
    folders = result.scalars().all()

    # Query note counts grouped by folder_id
    counts_stmt = (
        select(Note.folder_id, func.count(Note.id))
        .where(Note.owner_id == user.id, Note.folder_id.is_not(None))
        .group_by(Note.folder_id)
    )
    counts_res = await db.execute(counts_stmt)
    counts_dict = {row[0]: row[1] for row in counts_res.all()}

    folder_responses = [
        FolderResponse(
            id=f.id,
            owner_id=f.owner_id,
            name=f.name,
            parent_id=f.parent_id,
            note_count=counts_dict.get(f.id, 0),
            created_at=f.created_at,
            updated_at=f.updated_at,
        )
        for f in folders
    ]

    return FolderListResponse(
        data=folder_responses,
        count=len(folder_responses),
    )


@router.patch(
    "/{folder_id}",
    response_model=FolderDetailResponse,
    summary="Rename or move a folder",
)
async def update_folder(
    folder_id: UUID,
    req: FolderUpdateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> FolderDetailResponse:
    """Update folder properties (e.g., name or parent_id)."""
    stmt = select(Folder).where(Folder.id == folder_id, Folder.owner_id == user.id)
    result = await db.execute(stmt)
    folder = result.scalar_one_or_none()

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "folder_not_found", "message": "Folder not found or access denied"},
        )

    if req.name is not None:
        folder.name = req.name.strip()

    if req.parent_id is not None:
        if req.parent_id == folder_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "circular_parent", "message": "Folder cannot be its own parent"},
            )
        parent_stmt = select(Folder).where(Folder.id == req.parent_id, Folder.owner_id == user.id)
        parent_res = await db.execute(parent_stmt)
        if not parent_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "parent_not_found", "message": "Parent folder not found"},
            )
        folder.parent_id = req.parent_id

    await db.commit()
    await db.refresh(folder)

    # Count notes in this folder
    count_stmt = select(func.count(Note.id)).where(Note.folder_id == folder.id)
    count_res = await db.execute(count_stmt)
    note_count = count_res.scalar() or 0

    return FolderDetailResponse(
        data=FolderResponse(
            id=folder.id,
            owner_id=folder.owner_id,
            name=folder.name,
            parent_id=folder.parent_id,
            note_count=note_count,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
        )
    )


@router.delete(
    "/{folder_id}",
    summary="Delete a folder",
)
async def delete_folder(
    folder_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, dict[str, str | bool]]:
    """Delete a folder. Notes contained within will be set to unfiled."""
    stmt = select(Folder).where(Folder.id == folder_id, Folder.owner_id == user.id)
    result = await db.execute(stmt)
    folder = result.scalar_one_or_none()

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "folder_not_found", "message": "Folder not found or access denied"},
        )

    # Detach notes from folder so notes are not deleted
    notes_stmt = select(Note).where(Note.folder_id == folder_id)
    notes_res = await db.execute(notes_stmt)
    for n in notes_res.scalars().all():
        n.folder_id = None

    await db.delete(folder)
    await db.commit()

    return {"data": {"deleted": True, "id": str(folder_id)}}
