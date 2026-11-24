"""
Pydantic schemas for Folder requests and responses.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FolderBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: UUID | None = None


class FolderCreateRequest(FolderBase):
    pass


class FolderUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    parent_id: UUID | None = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    name: str
    parent_id: UUID | None = None
    note_count: int = 0
    created_at: datetime
    updated_at: datetime


class FolderListResponse(BaseModel):
    data: list[FolderResponse]
    count: int


class FolderDetailResponse(BaseModel):
    data: FolderResponse
