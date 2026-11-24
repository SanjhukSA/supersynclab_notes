import io
import uuid

import fitz  # PyMuPDF
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from db.models import Chunk, Note, Page, User
from db.session import async_session_factory
from deps import current_user
from main import app
from services.ingestion import ingestion_service
from services.storage import storage_service

mock_user_id = uuid.uuid4()
mock_user = User(
    id=mock_user_id,
    clerk_id=f"user_ingest_{mock_user_id.hex[:8]}",
    email="researcher@example.edu",
    display_name="Ingestion Test User",
    avatar_url=None,
)


@pytest.fixture(autouse=True)
async def setup_ingest_user():
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


def create_sample_pdf_bytes() -> bytes:
    """Create a minimal 2-page PDF in-memory with text for testing."""
    doc = fitz.open()

    # Page 1
    p1 = doc.new_page()
    p1.insert_text(
        fitz.Point(50, 72),
        "Thermodynamics Lecture 1: First Law of Thermodynamics.\n"
        "Energy cannot be created or destroyed, only transformed from one form to another.",
    )

    # Page 2
    p2 = doc.new_page()
    p2.insert_text(
        fitz.Point(50, 72),
        "Thermodynamics Lecture 2: Second Law and Entropy.\n"
        "The total entropy of an isolated system always increases over time.",
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.mark.asyncio
async def test_ingestion_pipeline_end_to_end():
    """Verify PyMuPDF parsing, page rendering, chunking, and embedding storage."""
    pdf_bytes = create_sample_pdf_bytes()
    file_payload = io.BytesIO(pdf_bytes)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Upload note
        upload_res = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("thermodynamics.pdf", file_payload, "application/pdf")},
        )
        assert upload_res.status_code == 201
        note_id_str = upload_res.json()["data"]["id"]
        note_id = uuid.UUID(note_id_str)

        # 2. Run ingestion pipeline synchronously in test
        success = await ingestion_service.process_note(note_id)
        assert success is True

        # 3. Verify Note record in DB
        async with async_session_factory() as session:
            note_res = await session.execute(select(Note).where(Note.id == note_id))
            note = note_res.scalar_one()
            assert note.status == "ready"
            assert note.page_count == 2

            # 4. Verify Pages in DB and rendered images on disk
            pages_res = await session.execute(
                select(Page).where(Page.note_id == note_id).order_by(Page.page_number)
            )
            pages = pages_res.scalars().all()
            assert len(pages) == 2
            assert "Thermodynamics" in (pages[0].text_content or "")
            assert pages[0].image_path is not None

            # Verify image file was rendered on disk
            img_abs = storage_service.get_absolute_path(pages[0].image_path)
            assert img_abs.exists()
            assert img_abs.stat().st_size > 0

            # 5. Verify Chunks in DB (both parent and child chunks with embeddings)
            chunks_res = await session.execute(select(Chunk).where(Chunk.note_id == note_id))
            chunks = chunks_res.scalars().all()
            assert len(chunks) > 0

            parent_chunks = [c for c in chunks if c.chunk_type == "parent"]
            child_chunks = [c for c in chunks if c.chunk_type == "child"]

            assert len(parent_chunks) > 0
            assert len(child_chunks) > 0
            # Child chunks must have 768-dim embedding
            assert child_chunks[0].embedding is not None

        # 6. Verify pages API endpoint
        pages_api_res = await ac.get(f"/api/v1/notes/{note_id}/pages")
        assert pages_api_res.status_code == 200
        assert pages_api_res.json()["count"] == 2

        # 7. Cleanup
        await ac.delete(f"/api/v1/notes/{note_id}")
