import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from db.models import User
from db.session import async_session_factory
from deps import current_user
from main import app

mock_user_id = uuid.uuid4()
mock_user = User(
    id=mock_user_id,
    clerk_id=f"user_test_{mock_user_id.hex[:8]}",
    email="student@example.edu",
    display_name="Test Student",
    avatar_url=None,
)


@pytest.fixture(autouse=True)
async def setup_test_user():
    """Ensure mock user exists in Postgres so foreign keys succeed."""
    async with async_session_factory() as session:
        stmt = select(User).where(User.id == mock_user.id)
        res = await session.execute(stmt)
        existing = res.scalar_one_or_none()
        if not existing:
            session.add(mock_user)
            await session.commit()

    app.dependency_overrides[current_user] = lambda: mock_user
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_upload_unsupported_file_fails():
    """Uploading an unsupported extension (.exe) should return 422."""
    fake_file = io.BytesIO(b"fake binary content")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("malicious.exe", fake_file, "application/octet-stream")},
        )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_file_type"


@pytest.mark.asyncio
async def test_upload_valid_pdf_and_lifecycle():
    """Upload a valid digital PDF, verify listing, retrieving status, and deletion."""
    sample_pdf_bytes = b"%PDF-1.4 sample pdf content for testing unit 2"
    file_payload = io.BytesIO(sample_pdf_bytes)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Upload
        upload_res = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("calculus_notes.pdf", file_payload, "application/pdf")},
        )
        assert upload_res.status_code == 201
        body = upload_res.json()
        assert body["data"]["title"] == "calculus_notes.pdf"
        assert body["data"]["file_type"] == "PDF"
        assert body["data"]["status"] == "pending"
        note_id = body["data"]["id"]

        # 2. List
        list_res = await ac.get("/api/v1/notes")
        assert list_res.status_code == 200
        notes = list_res.json()["data"]
        assert any(n["id"] == note_id for n in notes)

        # 3. Retrieve single note
        detail_res = await ac.get(f"/api/v1/notes/{note_id}")
        assert detail_res.status_code == 200
        assert detail_res.json()["data"]["id"] == note_id

        # 4. Delete note
        del_res = await ac.delete(f"/api/v1/notes/{note_id}")
        assert del_res.status_code == 200
        assert del_res.json()["data"]["deleted"] is True

        # 5. Verify deleted note is no longer accessible
        after_del_res = await ac.get(f"/api/v1/notes/{note_id}")
        assert after_del_res.status_code == 404
