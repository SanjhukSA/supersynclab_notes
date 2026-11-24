"""
Pydantic schemas for Collaborative Sharing and Shareable Study Desk Links.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from schemas.chat import MessageResponse
from schemas.notes import NoteResponse, PageResponse


class CreateShareLinkRequest(BaseModel):
    resource_type: str = Field(..., pattern="^(note|chat|folder)$")
    resource_id: UUID


class ShareLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    share_token: str
    share_url: str
    resource_type: str
    resource_id: UUID
    created_at: datetime


class SharedResourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    resource_type: str
    resource_id: UUID
    title: str
    subject: str | None = None
    creator_name: str | None = None
    note: NoteResponse | None = None
    pages: list[PageResponse] = Field(default_factory=list)
    chat_messages: list[MessageResponse] = Field(default_factory=list)
    created_at: datetime


class CreateShareGrantRequest(BaseModel):
    resource_type: str = Field(..., pattern="^(note|chat|folder)$")
    resource_id: UUID
    grantee_email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: str = Field(default="viewer", pattern="^(viewer|editor)$")


class ShareGrantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resource_type: str
    resource_id: UUID
    grantee_email: str
    role: str
    created_at: datetime
