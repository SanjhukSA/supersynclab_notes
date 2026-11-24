"""
Pydantic schemas for Google Drive & Google Classroom integration.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from schemas.notes import NoteResponse


class GoogleConnectionStatus(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_connected: bool
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    drive_available: bool = True
    classroom_available: bool = True
    error: str | None = None


class GoogleDriveItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    mime_type: str
    is_folder: bool = False
    size_bytes: int | None = None
    modified_time: datetime | None = None
    icon_url: str | None = None
    web_view_link: str | None = None
    parent_id: str | None = None


class GoogleDriveBrowseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    folder_id: str
    folder_name: str | None = None
    parent_id: str | None = None
    items: list[GoogleDriveItem]
    next_page_token: str | None = None


class GoogleClassroomCourse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    section: str | None = None
    description: str | None = None
    alternate_link: str | None = None


class GoogleClassroomMaterial(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    course_name: str
    title: str
    file_id: str
    file_name: str
    mime_type: str = "application/pdf"
    size_bytes: int | None = None
    alternate_link: str | None = None


class GoogleImportItem(BaseModel):
    file_id: str
    file_name: str
    mime_type: str = "application/pdf"
    source: str = "drive"  # "drive" | "classroom"
    course_name: str | None = None


class GoogleImportRequest(BaseModel):
    items: list[GoogleImportItem] = Field(..., min_length=1)
    folder_id: UUID | None = None
    access_token: str | None = None
    create_subfolder: bool = False
    subfolder_name: str | None = None


class GoogleImportResponse(BaseModel):
    imported_count: int
    notes: list[NoteResponse]
    message: str
