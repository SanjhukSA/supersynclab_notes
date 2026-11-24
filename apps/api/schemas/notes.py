"""
Pydantic schemas for Note requests and responses.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    note_id: UUID
    page_number: int
    image_path: str | None = None
    created_at: datetime


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    folder_id: UUID | None = None
    title: str
    file_type: str
    file_path: str
    subject: str | None = None
    topic: str | None = None
    tags: str | None = None
    summary: str | None = None
    status: str
    page_count: int
    created_at: datetime
    updated_at: datetime


class NoteListResponse(BaseModel):
    data: list[NoteResponse]
    count: int


class NoteDetailResponse(BaseModel):
    data: NoteResponse


class NoteUpdateRequest(BaseModel):
    title: str | None = None
    folder_id: UUID | None = None
    subject: str | None = None
    topic: str | None = None
    tags: str | None = None


class NoteUploadResponse(BaseModel):
    message: str
    data: NoteResponse


class PageListResponse(BaseModel):
    data: list[PageResponse]
    count: int


class SearchMatchSnippet(BaseModel):
    page_number: int
    snippet: str
    chunk_id: UUID


class SearchNoteResult(BaseModel):
    note_id: UUID
    title: str
    subject: str | None = None
    topic: str | None = None
    file_type: str
    page_count: int
    match_type: str  # "title" | "subject" | "content"
    snippets: list[SearchMatchSnippet] = []


class GlobalSearchResponse(BaseModel):
    query: str
    results: list[SearchNoteResult]
    total_matches: int
