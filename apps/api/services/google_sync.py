"""
Google Sync Service — Handles discovery and intake from Google Drive and Google Classroom.

Provides real folder/file browsing and streams actual documents into the SuperNotes storage
pipeline, transitioning them into high-res pages and grounded RAG chunks.
"""

import logging
import uuid
from datetime import datetime

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import Folder, Note, User
from schemas.google_sync import (
    GoogleClassroomCourse,
    GoogleClassroomMaterial,
    GoogleConnectionStatus,
    GoogleDriveBrowseResponse,
    GoogleDriveItem,
    GoogleImportItem,
)
from services.storage import storage_service

logger = logging.getLogger("supernotes.google_sync")


class GoogleSyncService:
    async def get_connection_status(
        self, user: User, access_token: str | None = None
    ) -> GoogleConnectionStatus:
        """Validate connection status with Google using access token or Clerk OAuth."""
        token = access_token

        # Check Clerk backend for user's Google OAuth token if none passed
        if not token and settings.clerk_secret_key:
            token = await self._get_clerk_google_token(user.clerk_id)

        if not token:
            return GoogleConnectionStatus(is_connected=False)

        # Validate token against Google UserInfo API
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if res.status_code == 200:
                    data = res.json()
                    return GoogleConnectionStatus(
                        is_connected=True,
                        email=data.get("email"),
                        display_name=data.get("name"),
                        avatar_url=data.get("picture"),
                        drive_available=True,
                        classroom_available=True,
                    )
                logger.warning(f"Google token validation returned {res.status_code}: {res.text}")
                return GoogleConnectionStatus(
                    is_connected=False,
                    error="Google access token is invalid or expired. Please reconnect.",
                )
        except Exception as e:
            logger.error(f"Error checking Google connection status: {e}")
            return GoogleConnectionStatus(is_connected=False, error=str(e))

    async def _get_clerk_google_token(self, clerk_id: str) -> str | None:
        """Fetch Google OAuth token from Clerk API if available."""
        try:
            url = f"https://api.clerk.com/v1/users/{clerk_id}/oauth_access_tokens/oauth_google"
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    url, headers={"Authorization": f"Bearer {settings.clerk_secret_key}"}
                )
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, list) and len(data) > 0:
                        return data[0].get("token")
        except Exception as e:
            logger.debug(f"Could not retrieve Google token from Clerk: {e}")
        return None

    async def browse_drive(
        self,
        access_token: str,
        folder_id: str = "root",
        query: str | None = None,
        page_token: str | None = None,
    ) -> GoogleDriveBrowseResponse:
        """Browse real Google Drive folders and files."""
        headers = {"Authorization": f"Bearer {access_token}"}

        # Build query
        if query and query.strip():
            safe_query = query.replace("'", "\\'")
            q = f"name contains '{safe_query}' and trashed = false"
        else:
            q = f"'{folder_id}' in parents and trashed = false"

        params = {
            "q": q,
            "fields": (
                "nextPageToken, files(id, name, mimeType, size, modifiedTime, "
                "iconLink, webViewLink, parents)"
            ),
            "pageSize": 100,
            "orderBy": "folder,name",
        }
        if page_token:
            params["pageToken"] = page_token

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                headers=headers,
                params=params,
            )
            if res.status_code != 200:
                logger.error(f"Google Drive API error: {res.status_code} - {res.text}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "google_drive_api_error",
                        "message": (
                            f"Google Drive error ({res.status_code}). Ensure Drive permissions "
                            "are granted."
                        ),
                    },
                )

            data = res.json()
            raw_files = data.get("files", [])

            items: list[GoogleDriveItem] = []
            for f in raw_files:
                mime = f.get("mimeType", "")
                is_folder = mime == "application/vnd.google-apps.folder"
                mod_time = None
                if f.get("modifiedTime"):
                    try:
                        mod_time = datetime.fromisoformat(
                            f["modifiedTime"].replace("Z", "+00:00")
                        )
                    except Exception:
                        pass

                parent_id = f.get("parents", [None])[0] if f.get("parents") else None

                items.append(
                    GoogleDriveItem(
                        id=f["id"],
                        name=f["name"],
                        mime_type=mime,
                        is_folder=is_folder,
                        size_bytes=int(f["size"]) if f.get("size") else None,
                        modified_time=mod_time,
                        icon_url=f.get("iconLink"),
                        web_view_link=f.get("webViewLink"),
                        parent_id=parent_id,
                    )
                )

            folder_name = "My Drive" if folder_id == "root" else None
            parent_id = None

            if folder_id != "root":
                try:
                    f_res = await client.get(
                        f"https://www.googleapis.com/drive/v3/files/{folder_id}",
                        headers=headers,
                        params={"fields": "id, name, parents"},
                    )
                    if f_res.status_code == 200:
                        f_data = f_res.json()
                        folder_name = f_data.get("name")
                        if f_data.get("parents"):
                            parent_id = f_data["parents"][0]
                except Exception as e:
                    logger.warning(f"Could not fetch parent metadata for {folder_id}: {e}")

            return GoogleDriveBrowseResponse(
                folder_id=folder_id,
                folder_name=folder_name,
                parent_id=parent_id,
                items=items,
                next_page_token=data.get("nextPageToken"),
            )

    async def list_classroom_courses(self, access_token: str) -> list[GoogleClassroomCourse]:
        """List active student courses from Google Classroom."""
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE"

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(url, headers=headers)
            if res.status_code != 200:
                logger.error(f"Google Classroom error: {res.status_code} - {res.text}")
                return []

            data = res.json()
            courses = []
            for c in data.get("courses", []):
                courses.append(
                    GoogleClassroomCourse(
                        id=c["id"],
                        name=c["name"],
                        section=c.get("section"),
                        description=c.get("descriptionHeading"),
                        alternate_link=c.get("alternateLink"),
                    )
                )
            return courses

    async def list_classroom_materials(
        self, access_token: str, course_id: str
    ) -> list[GoogleClassroomMaterial]:
        """List course materials and assignments with attached Drive files."""
        headers = {"Authorization": f"Bearer {access_token}"}
        materials: list[GoogleClassroomMaterial] = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            # 1. Coursework materials
            m_res = await client.get(
                f"https://classroom.googleapis.com/v1/courses/{course_id}/courseWorkMaterials",
                headers=headers,
            )
            if m_res.status_code == 200:
                for item in m_res.json().get("courseWorkMaterial", []):
                    title = item.get("title", "Material")
                    for mat in item.get("materials", []):
                        drive_file = mat.get("driveFile", {}).get("driveFile")
                        if drive_file:
                            materials.append(
                                GoogleClassroomMaterial(
                                    id=f"cwm_{drive_file['id']}",
                                    course_id=course_id,
                                    course_name="",
                                    title=title,
                                    description=item.get("description"),
                                    file_id=drive_file["id"],
                                    file_name=drive_file.get("title", f"{title}.pdf"),
                                    alternate_link=drive_file.get("alternateLink"),
                                )
                            )

            # 2. Coursework (Assignments & Questions)
            cw_res = await client.get(
                f"https://classroom.googleapis.com/v1/courses/{course_id}/courseWork",
                headers=headers,
            )
            if cw_res.status_code == 200:
                for cw in cw_res.json().get("courseWork", []):
                    title = cw.get("title", "Assignment")
                    for mat in cw.get("materials", []):
                        drive_file = mat.get("driveFile", {}).get("driveFile")
                        if drive_file:
                            materials.append(
                                GoogleClassroomMaterial(
                                    id=f"cw_{drive_file['id']}",
                                    course_id=course_id,
                                    course_name="",
                                    title=title,
                                    description=cw.get("description"),
                                    file_id=drive_file["id"],
                                    file_name=drive_file.get("title", f"{title}.pdf"),
                                    alternate_link=drive_file.get("alternateLink"),
                                )
                            )

        return materials

    async def import_item(
        self,
        item: GoogleImportItem,
        user_id: uuid.UUID,
        folder_id: uuid.UUID | None,
        access_token: str | None = None,
    ) -> Note:
        """Download real file bytes from Google Drive and create Note."""
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "missing_google_token",
                    "message": "Google Access Token is required to download Drive files.",
                },
            )

        headers = {"Authorization": f"Bearer {access_token}"}
        note_id = uuid.uuid4()
        clean_title = item.file_name.rsplit(".", 1)[0].replace("_", " ")

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            is_google_doc = any(
                doc_type in item.mime_type
                for doc_type in [
                    "google-apps.document",
                    "google-apps.presentation",
                    "google-apps.spreadsheet",
                ]
            )

            if is_google_doc:
                # Export Google Docs / Slides as crisp PDF
                export_url = f"https://www.googleapis.com/drive/v3/files/{item.file_id}/export"
                res = await client.get(
                    export_url, headers=headers, params={"mimeType": "application/pdf"}
                )
                if res.status_code != 200:
                    logger.error(f"Google export failed ({res.status_code}): {res.text}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "google_export_failed",
                            "message": f"Could not export document from Google Drive: {res.text}",
                        },
                    )
                file_bytes = res.content
                rel_path = f"notes/{note_id}.pdf"
                file_type = "PDF"
            else:
                # Download binary file content (PDF, image, text)
                download_url = f"https://www.googleapis.com/drive/v3/files/{item.file_id}?alt=media"
                res = await client.get(download_url, headers=headers)
                if res.status_code != 200:
                    logger.error(f"Google download failed ({res.status_code}): {res.text}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "google_download_failed",
                            "message": f"Could not download file from Google Drive: {res.text}",
                        },
                    )
                file_bytes = res.content

                try:
                    file_type = storage_service.detect_file_type(item.file_name)
                except Exception:
                    file_type = "PDF"

                ext = item.file_name.rsplit(".", 1)[-1].lower() if "." in item.file_name else "pdf"
                rel_path = f"notes/{note_id}.{ext}"

        # Write real original file bytes to disk
        abs_path = storage_service.get_absolute_path(rel_path)
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(file_bytes)

        note = Note(
            id=note_id,
            owner_id=user_id,
            folder_id=folder_id,
            title=clean_title,
            file_type=file_type,
            file_path=rel_path,
            status="pending",
            page_count=1,
            subject=item.course_name,
        )

        logger.info(
            f"Successfully downloaded Google Drive file '{item.file_name}' "
            f"({len(file_bytes)} bytes) as note {note_id}"
        )
        return note

    async def create_folder_for_import(
        self, name: str, user_id: uuid.UUID, parent_id: uuid.UUID | None, db: AsyncSession
    ) -> Folder:
        """Create a new SuperNotes folder to hold imported notes."""
        folder = Folder(
            id=uuid.uuid4(),
            owner_id=user_id,
            parent_id=parent_id,
            name=name,
        )
        db.add(folder)
        await db.flush()
        return folder


google_sync_service = GoogleSyncService()
