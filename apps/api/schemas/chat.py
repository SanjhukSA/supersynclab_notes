"""
Pydantic schemas for Chat, Message, and Citation requests and responses.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    message_id: UUID
    chunk_id: UUID
    page_id: UUID
    note_id: UUID | None = None
    page_number: int | None = None
    note_title: str | None = None
    page_image_path: str | None = None
    snippet: str
    bbox_x: float
    bbox_y: float
    bbox_width: float
    bbox_height: float
    created_at: datetime | None = None


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    chat_id: UUID
    role: str
    content: str
    citations: list[CitationResponse] = Field(default_factory=list)
    created_at: datetime | None = None



class ChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ChatListResponse(BaseModel):
    data: list[ChatResponse]
    count: int


class ChatDetailResponse(BaseModel):
    data: ChatResponse
    messages: list[MessageResponse]


class CreateChatRequest(BaseModel):
    title: str | None = "New Chat"


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    mode: Literal["hybrid", "notes_only", "ai_only"] = "hybrid"
    allow_external: bool = True
    image_data: str | None = None
    note_ids: list[UUID] | None = None
    folder_id: UUID | None = None


class SendMessageResponse(BaseModel):
    message: MessageResponse
    chat_id: UUID
