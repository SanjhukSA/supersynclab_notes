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
    clerk_id=f"user_m2_{mock_user_id.hex[:8]}",
    email="m2_student@example.edu",
    display_name="M2 Student",
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
async def test_folders_crud_and_note_assignment():
    """Test creating a folder, listing folders, assigning a note, and deleting folder."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Create a folder
        create_res = await ac.post("/api/v1/folders", json={"name": "Quantum Physics"})
        assert create_res.status_code == 201
        folder_data = create_res.json()["data"]
        folder_id = folder_data["id"]
        assert folder_data["name"] == "Quantum Physics"

        # 2. List folders
        list_res = await ac.get("/api/v1/folders")
        assert list_res.status_code == 200
        folders = list_res.json()["data"]
        assert any(f["id"] == folder_id for f in folders)

        # 3. Upload a note
        file_payload = io.BytesIO(b"%PDF-1.4 sample study note for quantum mechanics")
        upload_res = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("quantum_notes.pdf", file_payload, "application/pdf")},
        )
        assert upload_res.status_code == 201
        note_id = upload_res.json()["data"]["id"]

        # 4. Move note to the folder
        patch_res = await ac.patch(
            f"/api/v1/notes/{note_id}",
            json={"folder_id": folder_id, "subject": "Physics"},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["data"]["folder_id"] == folder_id
        assert patch_res.json()["data"]["subject"] == "Physics"

        # 5. List notes filtered by folder_id
        filtered_res = await ac.get(f"/api/v1/notes?folder_id={folder_id}")
        assert filtered_res.status_code == 200
        assert any(n["id"] == note_id for n in filtered_res.json()["data"])

        # 6. Delete folder (note remains, becomes unfiled)
        del_folder_res = await ac.delete(f"/api/v1/folders/{folder_id}")
        assert del_folder_res.status_code == 200

        # Note check
        note_res = await ac.get(f"/api/v1/notes/{note_id}")
        assert note_res.status_code == 200
        assert note_res.json()["data"]["folder_id"] is None

        # Clean up note
        await ac.delete(f"/api/v1/notes/{note_id}")


@pytest.mark.asyncio
async def test_study_cheat_sheet_and_quiz():
    """Test generating 1-page cheat sheet and active recall quiz."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Upload note
        file_payload = io.BytesIO(b"Energy = h * nu. Planck constant h = 6.626e-34 J s.")
        upload_res = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("planck_study.txt", file_payload, "text/plain")},
        )
        assert upload_res.status_code == 201
        note_id = upload_res.json()["data"]["id"]

        # Request Cheat Sheet
        cs_res = await ac.post(f"/api/v1/notes/{note_id}/cheatsheet")
        assert cs_res.status_code == 200
        cs_data = cs_res.json()
        assert "markdown" in cs_data
        assert len(cs_data["markdown"]) > 50

        # Request Practice Quiz
        quiz_res = await ac.post(f"/api/v1/notes/{note_id}/quiz")
        assert quiz_res.status_code == 200
        quiz_data = quiz_res.json()
        assert len(quiz_data["questions"]) >= 2
        assert "question" in quiz_data["questions"][0]
        assert "options" in quiz_data["questions"][0]
        assert "correct_index" in quiz_data["questions"][0]

        # Clean up
        await ac.delete(f"/api/v1/notes/{note_id}")
