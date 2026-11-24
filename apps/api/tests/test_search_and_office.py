import uuid

import docx
import pptx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from db.models import Chunk, Note, Page, User
from db.session import async_session_factory
from deps import current_user
from main import app
from services.parser import document_parser
from services.storage import storage_service

mock_user_id = uuid.uuid4()
mock_user = User(
    id=mock_user_id,
    clerk_id=f"user_search_{mock_user_id.hex[:8]}",
    email="search_student@example.edu",
    display_name="Search Student",
    avatar_url=None,
)


@pytest.fixture
async def setup_search_user():
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
async def test_docx_and_pptx_parsing():
    """Verify that Word (.docx) and PowerPoint (.pptx) documents are parsed and rendered."""
    note_id_docx = uuid.uuid4()
    note_id_pptx = uuid.uuid4()

    # 1. Test DOCX
    docx_rel = f"notes/{note_id_docx}.docx"
    docx_abs = storage_service.get_absolute_path(docx_rel)
    docx_abs.parent.mkdir(parents=True, exist_ok=True)
    d = docx.Document()
    d.add_heading("Automata & Formal Languages", 0)
    d.add_paragraph("A Deterministic Finite Automaton (DFA) consists of 5 tuples.")
    d.save(str(docx_abs))

    docx_pages = await document_parser.parse_document(docx_rel, "DOCX", note_id_docx)
    assert len(docx_pages) >= 1
    assert "Deterministic Finite Automaton" in docx_pages[0].text_content
    docx_img = storage_service.get_absolute_path(docx_pages[0].image_rel_path)
    assert docx_img.exists()

    # 2. Test PPTX
    pptx_rel = f"notes/{note_id_pptx}.pptx"
    pptx_abs = storage_service.get_absolute_path(pptx_rel)
    pptx_abs.parent.mkdir(parents=True, exist_ok=True)
    p = pptx.Presentation()
    s = p.slides.add_slide(p.slide_layouts[1])
    s.shapes.title.text = "Graph Theory & Trees"
    tf = s.shapes.placeholders[1].text_frame
    tf.text = "Tree Properties:"
    p1 = tf.add_paragraph()
    p1.text = "1. Connected and acyclic graph"
    p.save(str(pptx_abs))

    pptx_pages = await document_parser.parse_document(pptx_rel, "PPTX", note_id_pptx)
    assert len(pptx_pages) >= 1
    assert "Graph Theory" in pptx_pages[0].text_content
    pptx_img = storage_service.get_absolute_path(pptx_pages[0].image_rel_path)
    assert pptx_img.exists()

    # Cleanup test files
    docx_abs.unlink(missing_ok=True)
    pptx_abs.unlink(missing_ok=True)
    docx_img.unlink(missing_ok=True)
    pptx_img.unlink(missing_ok=True)
    try:
        docx_img.parent.rmdir()
        pptx_img.parent.rmdir()
    except Exception:
        pass


@pytest.mark.asyncio
async def test_global_search_endpoint(setup_search_user):
    """Verify global search finds notes by title, subject, and chunk content."""
    async with async_session_factory() as session:
        # Create test note
        test_note = Note(
            id=uuid.uuid4(),
            owner_id=mock_user.id,
            title="Compiler Design Lecture Notes.docx",
            file_type="DOCX",
            file_path="notes/test_compiler.docx",
            subject="Computer Science",
            topic="Lexical Analysis",
            status="ready",
            page_count=2,
        )
        session.add(test_note)
        await session.flush()

        test_page = Page(
            id=uuid.uuid4(),
            note_id=test_note.id,
            page_number=1,
            text_content="Lexical analysis uses regular expressions to generate tokens.",
        )
        session.add(test_page)
        await session.flush()

        test_chunk = Chunk(
            id=uuid.uuid4(),
            note_id=test_note.id,
            page_id=test_page.id,
            content="Lexical analysis converts stream of characters into tokens via lexemes.",
            chunk_index=0,
            chunk_type="child",
        )
        session.add(test_chunk)
        await session.commit()

        note_id_to_clean = test_note.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Search by title / subject keyword
        res1 = await ac.get("/api/v1/notes/search?q=Compiler")
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["total_matches"] >= 1
        assert any(r["title"] == "Compiler Design Lecture Notes.docx" for r in data1["results"])

        # 2. Search by content inside chunk
        res2 = await ac.get("/api/v1/notes/search?q=lexemes")
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["total_matches"] >= 1
        match = next(r for r in data2["results"] if r["note_id"] == str(note_id_to_clean))
        assert len(match["snippets"]) > 0
        assert "lexemes" in match["snippets"][0]["snippet"]
        assert match["snippets"][0]["page_number"] == 1

    # Cleanup test data from DB
    async with async_session_factory() as session:
        n = (await session.execute(select(Note).where(Note.id == note_id_to_clean))).scalar_one()
        await session.delete(n)
        await session.commit()
