"""
Notes router — upload, list, status check, processing, and deletion of notes.

All endpoints require authentication (Clerk session token).
Retrieval and modification are scoped to the authenticated user.
"""

import uuid
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Chunk, Note, Page
from db.session import get_db
from deps import CurrentUser
from schemas.notes import (
    GlobalSearchResponse,
    NoteDetailResponse,
    NoteListResponse,
    NoteResponse,
    NoteUpdateRequest,
    NoteUploadResponse,
    PageListResponse,
    PageResponse,
    SearchMatchSnippet,
    SearchNoteResult,
)
from services.ingestion import ingestion_service
from services.storage import storage_service

router = APIRouter()


@router.post(
    "/upload",
    response_model=NoteUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a study note file (PDF, image, or text)",
)
async def upload_note(
    user: CurrentUser,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> NoteUploadResponse:
    """
    Accept an uploaded document, store it on local disk via StorageService,
    register a new Note row in PostgreSQL with status 'pending', and launch
    background ingestion pipeline.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "missing_filename", "message": "Uploaded file must have a filename"},
        )

    note_id = uuid.uuid4()

    # Stream to storage under storage/notes/{note_id}.{ext}
    rel_path, file_type, _ = await storage_service.save_upload(file, note_id)

    # Insert Note row in Postgres
    note = Note(
        id=note_id,
        owner_id=user.id,
        folder_id=folder_id,
        title=file.filename,
        file_type=file_type,
        file_path=rel_path,
        status="pending",
        page_count=0,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    # Launch ingestion in background
    background_tasks.add_task(ingestion_service.process_note, note_id)

    return NoteUploadResponse(
        message="Note uploaded. Ingestion processing started in background.",
        data=NoteResponse.model_validate(note),
    )


@router.post(
    "/{note_id}/process",
    response_model=NoteDetailResponse,
    summary="Trigger or re-trigger ingestion processing for a note",
)
async def process_note_endpoint(
    note_id: UUID,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> NoteDetailResponse:
    """Manually queue or retry ingestion processing for a note."""
    stmt = select(Note).where(Note.id == note_id, Note.owner_id == user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    note.status = "pending"
    await db.commit()

    background_tasks.add_task(ingestion_service.process_note, note_id)
    return NoteDetailResponse(data=NoteResponse.model_validate(note))


@router.get(
    "",
    response_model=NoteListResponse,
    summary="List all notes owned by the current user",
)
async def list_notes(
    user: CurrentUser,
    folder_id: UUID | None = None,
    unfiled: bool = False,
    db: AsyncSession = Depends(get_db),
) -> NoteListResponse:
    """Retrieve notes owned by the authenticated user, newest first."""
    stmt = select(Note).where(Note.owner_id == user.id)
    if unfiled:
        stmt = stmt.where(Note.folder_id.is_(None))
    elif folder_id is not None:
        stmt = stmt.where(Note.folder_id == folder_id)

    stmt = stmt.order_by(desc(Note.created_at))
    result = await db.execute(stmt)
    notes = result.scalars().all()

    return NoteListResponse(
        data=[NoteResponse.model_validate(n) for n in notes],
        count=len(notes),
    )


def _extract_snippet(content: str, query: str, radius: int = 70) -> str:
    """Extract a surrounding text snippet centered around the matching query term."""
    cleaned = " ".join(content.split())
    lower_content = cleaned.lower()
    lower_q = query.lower()
    pos = lower_content.find(lower_q)
    if pos == -1:
        return (cleaned[: 2 * radius] + "...") if len(cleaned) > 2 * radius else cleaned

    start = max(0, pos - radius)
    end = min(len(cleaned), pos + len(query) + radius)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(cleaned) else ""
    return f"{prefix}{cleaned[start:end]}{suffix}"


@router.get(
    "/search",
    response_model=GlobalSearchResponse,
    summary="Global search across notes, subjects, topics, and chunk content",
)
async def search_notes(
    user: CurrentUser,
    q: str = Query(..., min_length=1, max_length=100, description="Search query string"),
    db: AsyncSession = Depends(get_db),
) -> GlobalSearchResponse:
    """
    Search across note metadata (title, subject, topic, tags) and verbatim chunk text.
    Strictly scoped to notes owned by the authenticated user.
    """
    cleaned_query = q.strip()
    term = f"%{cleaned_query}%"

    # 1. Search notes by metadata
    note_stmt = (
        select(Note)
        .where(
            Note.owner_id == user.id,
            or_(
                Note.title.ilike(term),
                Note.subject.ilike(term),
                Note.topic.ilike(term),
                Note.tags.ilike(term),
            ),
        )
        .order_by(desc(Note.updated_at))
        .limit(15)
    )
    note_results = (await db.execute(note_stmt)).scalars().all()

    # Track results by note ID to avoid duplication
    results_map: dict[UUID, SearchNoteResult] = {}

    for note in note_results:
        match_type = "title" if cleaned_query.lower() in note.title.lower() else "subject"
        fallback_snippet = note.summary or f"Matching {match_type}: {note.title}"
        results_map[note.id] = SearchNoteResult(
            note_id=note.id,
            title=note.title,
            subject=note.subject,
            topic=note.topic,
            file_type=note.file_type,
            page_count=note.page_count,
            match_type=match_type,
            snippets=[
                SearchMatchSnippet(
                    page_number=1,
                    snippet=fallback_snippet[:150],
                    chunk_id=note.id,
                )
            ],
        )

    # 2. Search chunks by text content
    chunk_stmt = (
        select(Chunk, Note, Page)
        .join(Note, Chunk.note_id == Note.id)
        .outerjoin(Page, Chunk.page_id == Page.id)
        .where(
            Note.owner_id == user.id,
            Chunk.content.ilike(term),
        )
        .order_by(desc(Note.updated_at))
        .limit(30)
    )
    chunk_rows = (await db.execute(chunk_stmt)).all()

    for chunk, note, page in chunk_rows:
        page_num = page.page_number if page else 1
        snippet_text = _extract_snippet(chunk.content, cleaned_query)
        match_snippet = SearchMatchSnippet(
            page_number=page_num,
            snippet=snippet_text,
            chunk_id=chunk.id,
        )

        if note.id in results_map:
            existing = results_map[note.id]
            # If current snippet is just title fallback, replace with verbatim passage
            if len(existing.snippets) == 1 and existing.snippets[0].snippet.startswith("Matching "):
                existing.snippets = [match_snippet]
            elif len(existing.snippets) < 3:
                # Avoid duplicate identical snippets
                if not any(
                    s.page_number == page_num and s.snippet == snippet_text
                    for s in existing.snippets
                ):
                    existing.snippets.append(match_snippet)
        else:
            results_map[note.id] = SearchNoteResult(
                note_id=note.id,
                title=note.title,
                subject=note.subject,
                topic=note.topic,
                file_type=note.file_type,
                page_count=note.page_count,
                match_type="content",
                snippets=[match_snippet],
            )

    results_list = list(results_map.values())
    return GlobalSearchResponse(
        query=cleaned_query,
        results=results_list,
        total_matches=len(results_list),
    )


@router.patch(
    "/{note_id}",
    response_model=NoteDetailResponse,
    summary="Update note metadata or move to a folder",
)
async def update_note(
    note_id: UUID,
    req: NoteUpdateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> NoteDetailResponse:
    """Update note title, folder assignment, subject, topic, or tags."""
    stmt = select(Note).where(Note.id == note_id, Note.owner_id == user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    if req.title is not None:
        note.title = req.title.strip()
    if req.folder_id is not None:
        note.folder_id = req.folder_id
    if req.subject is not None:
        note.subject = req.subject.strip()
    if req.topic is not None:
        note.topic = req.topic.strip()
    if req.tags is not None:
        note.tags = req.tags.strip()

    await db.commit()
    await db.refresh(note)
    return NoteDetailResponse(data=NoteResponse.model_validate(note))


@router.get(
    "/{note_id}",
    response_model=NoteDetailResponse,
    summary="Get note details and processing status",
)
async def get_note(
    note_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> NoteDetailResponse:
    """Retrieve a single note by ID, verifying user ownership."""
    stmt = select(Note).where(Note.id == note_id, Note.owner_id == user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    return NoteDetailResponse(data=NoteResponse.model_validate(note))


@router.get(
    "/{note_id}/pages",
    response_model=PageListResponse,
    summary="Get list of rendered pages for a note",
)
async def get_note_pages(
    note_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PageListResponse:
    """Retrieve all rendered pages for a note."""
    stmt = select(Note).where(Note.id == note_id, Note.owner_id == user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    pages_stmt = select(Page).where(Page.note_id == note_id).order_by(asc(Page.page_number))
    pages_res = await db.execute(pages_stmt)
    pages = pages_res.scalars().all()

    return PageListResponse(
        data=[PageResponse.model_validate(p) for p in pages],
        count=len(pages),
    )


@router.delete(
    "/{note_id}",
    summary="Delete a note and its storage files",
)
async def delete_note(
    note_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, dict[str, str | bool]]:
    """Delete a note and remove all derived artifacts from disk."""
    stmt = select(Note).where(Note.id == note_id, Note.owner_id == user.id)
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    # Clean up physical file and any derived page images
    storage_service.delete_file(note.file_path)
    storage_service.delete_note_directory(note.id)

    # Delete from database (cascades to pages, chunks, citations)
    await db.delete(note)

    return {"data": {"deleted": True, "id": str(note_id)}}
