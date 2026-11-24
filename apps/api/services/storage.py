"""
Storage service — single point of access for all file I/O operations.

Invariants:
  - Files are stored on local disk under the configured STORAGE_DIR.
  - The database only stores relative paths (never raw file bytes).
  - Outside modules must never read or write files directly; they must use this service.
"""

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from config import settings

# Max file size limits in bytes
MAX_FILE_SIZES: dict[str, int] = {
    "PDF": 25 * 1024 * 1024,  # 25 MB
    "IMG": 10 * 1024 * 1024,  # 10 MB
    "TXT": 5 * 1024 * 1024,  # 5 MB
    "DOCX": 25 * 1024 * 1024,  # 25 MB
    "PPTX": 35 * 1024 * 1024,  # 35 MB
}

ALLOWED_EXTENSIONS: dict[str, str] = {
    "pdf": "PDF",
    "png": "IMG",
    "jpg": "IMG",
    "jpeg": "IMG",
    "webp": "IMG",
    "txt": "TXT",
    "docx": "DOCX",
    "pptx": "PPTX",
}


class StorageService:
    def __init__(self, base_dir: str | Path | None = None) -> None:
        self.base_dir = Path(base_dir or settings.storage_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def detect_file_type(self, filename: str) -> str:
        """Extract extension and return normalized file type (PDF, IMG, TXT)."""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        file_type = ALLOWED_EXTENSIONS.get(ext)
        if not file_type:
            allowed = ", ".join(ALLOWED_EXTENSIONS.keys())
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "unsupported_file_type",
                    "message": f"Unsupported file type .{ext}. Allowed: {allowed}",
                },
            )
        return file_type

    async def save_upload(self, file: UploadFile, note_id: uuid.UUID) -> tuple[str, str, int]:
        """
        Stream an uploaded file to storage.

        Returns:
            tuple[relative_path, file_type, file_size_in_bytes]
        """
        filename = file.filename or "uploaded_file"
        file_type = self.detect_file_type(filename)
        ext = filename.rsplit(".", 1)[-1].lower()

        # Target relative path: notes/{note_id}.{ext}
        rel_dir = Path("notes")
        rel_path = rel_dir / f"{note_id}.{ext}"
        abs_dir = self.base_dir / rel_dir
        abs_dir.mkdir(parents=True, exist_ok=True)
        abs_path = self.base_dir / rel_path

        # Stream file to disk and count bytes to enforce size limit
        size = 0
        max_size = MAX_FILE_SIZES[file_type]

        with abs_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                size += len(chunk)
                if size > max_size:
                    buffer.close()
                    abs_path.unlink(missing_ok=True)
                    limit_mb = max_size // (1024 * 1024)
                    msg = f"File exceeds maximum allowed size of {limit_mb}MB for {file_type}"
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={"code": "file_too_large", "message": msg},
                    )
                buffer.write(chunk)

        # Reset cursor in case caller needs it
        await file.seek(0)
        return str(rel_path).replace("\\", "/"), file_type, size

    def get_absolute_path(self, relative_path: str) -> Path:
        """Convert a stored relative path into an absolute Path."""
        return (self.base_dir / relative_path).resolve()

    def delete_file(self, relative_path: str) -> bool:
        """Safely remove a file from storage."""
        abs_path = self.get_absolute_path(relative_path)
        if abs_path.exists() and abs_path.is_file():
            abs_path.unlink()
            return True
        return False

    def delete_note_directory(self, note_id: uuid.UUID) -> None:
        """Remove any derived artifacts (e.g. page images) for a note."""
        page_dir = self.base_dir / "pages" / str(note_id)
        if page_dir.exists() and page_dir.is_dir():
            shutil.rmtree(page_dir, ignore_errors=True)


storage_service = StorageService()
