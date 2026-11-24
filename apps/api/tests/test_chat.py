import io
import uuid

import fitz
import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from sqlalchemy import select

from db.models import User
from db.session import async_session_factory
from deps import current_user
from services.ingestion import ingestion_service

mock_user_id = uuid.uuid4()
mock_user = User(
    id=mock_user_id,
    clerk_id=f"user_chat_{mock_user_id.hex[:8]}",
    email="student_chat@example.edu",
    display_name="Chat Test Student",
    avatar_url=None,
)

mock_other_user_id = uuid.uuid4()
mock_other_user = User(
    id=mock_other_user_id,
    clerk_id=f"user_other_{mock_other_user_id.hex[:8]}",
    email="other@example.edu",
    display_name="Other Student",
    avatar_url=None,
)


@pytest.fixture(autouse=True)
async def setup_chat_users():
    """Ensure mock users exist in Postgres."""
    async with async_session_factory() as session:
        for u in [mock_user, mock_other_user]:
            stmt = select(User).where(User.id == u.id)
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                session.add(u)
        await session.commit()

    app.dependency_overrides[current_user] = lambda: mock_user
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chat_lifecycle_and_empty_guardrail():
    """Verify chat creation, listing, and the deterministic 'Not covered' guardrail."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Create chat
        create_res = await ac.post("/api/v1/chats", json={"title": "Physics Cramming"})
        assert create_res.status_code == 201
        chat_id = create_res.json()["id"]

        # 2. List chats
        list_res = await ac.get("/api/v1/chats")
        assert list_res.status_code == 200
        assert any(c["id"] == chat_id for c in list_res.json()["data"])

        # 3. Ask question on a topic with NO uploaded notes -> Guardrail path
        msg_res = await ac.post(
            f"/api/v1/chats/{chat_id}/messages",
            json={"content": "What is the capital of Mars?", "allow_external": False},
        )
        assert msg_res.status_code == 201
        answer_data = msg_res.json()["message"]
        assert "Not covered in your uploaded notes." in answer_data["content"]
        assert len(answer_data["citations"]) == 0

        # 4. Delete chat
        del_res = await ac.delete(f"/api/v1/chats/{chat_id}")
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_rag_with_note_and_citations():
    """Ingest a note and verify RAG retrieval generates answer with exact citations."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        fitz.Point(50, 72),
        "Quantum Physics Chapter 1: Planck Relation.\n"
        "Energy is quantized: E = h * nu, where h is Planck's constant.",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Upload & ingest note
        upload_res = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("quantum.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        )
        assert upload_res.status_code == 201
        note_id = uuid.UUID(upload_res.json()["data"]["id"])
        await ingestion_service.process_note(note_id)

        # 2. Create chat session
        chat_res = await ac.post("/api/v1/chats", json={"title": "Quantum Study"})
        chat_id = chat_res.json()["id"]

        # 3. Ask question about Planck's constant
        ask_res = await ac.post(
            f"/api/v1/chats/{chat_id}/messages",
            json={"content": "What is the formula for energy according to Planck?"},
        )
        assert ask_res.status_code == 201
        msg = ask_res.json()["message"]

        # Answer must contain the grounded concept
        assert "quantum.pdf" in msg["content"] or "Planck" in msg["content"]
        # Citations must be generated linking to page 1 and include note_id & bounding box
        assert len(msg["citations"]) > 0
        citation = msg["citations"][0]
        assert citation["page_number"] == 1
        assert citation["note_id"] == str(note_id)
        assert citation["bbox_x"] is not None
        assert citation["bbox_width"] > 0
        note_name = (citation["note_title"] or "").lower()
        assert "Planck" in citation["snippet"] or "quantum" in note_name

        # 4. Check full chat history has messages and citations
        detail_res = await ac.get(f"/api/v1/chats/{chat_id}")
        assert detail_res.status_code == 200
        assert len(detail_res.json()["messages"]) == 2  # user + assistant

        # 5. Cleanup
        await ac.delete(f"/api/v1/notes/{note_id}")
        await ac.delete(f"/api/v1/chats/{chat_id}")


@pytest.mark.asyncio
async def test_generate_answer_normal_llm_path():
    """Verify that when LLM call succeeds, normal generated answer runs."""
    from unittest.mock import patch

    from llm.client import generate_answer
    from services.rag import RetrievedContext

    ctx = RetrievedContext(
        chunk_id=uuid.uuid4(),
        parent_chunk_id=uuid.uuid4(),
        note_id=uuid.uuid4(),
        note_title="Neural-Networks.pdf",
        page_id=uuid.uuid4(),
        page_number=1,
        page_image_path="storage/pages/test/p1.png",
        bbox_x=0.1,
        bbox_y=0.2,
        bbox_width=0.8,
        bbox_height=0.3,
        child_content="A neural network consists of interconnected artificial neurons.",
        parent_content=(
            "Full chapter on Artificial Neural Networks: A neural network consists of "
            "interconnected artificial neurons organized in layers."
        ),
        distance=0.2,
        score=0.9,
    )

    mock_llm_reply = (
        "A neural network is a computational model inspired by the human brain [cite:1]. "
        "It processes information through interconnected layers of neurons."
    )

    with patch("llm.client._call_llm_text", return_value=mock_llm_reply):
        ans, cites = await generate_answer("Explain neural network", [ctx])

    assert ans == mock_llm_reply
    assert len(cites) == 1
    assert cites[0].page_number == 1
    assert cites[0].note_title == "Neural-Networks.pdf"


@pytest.mark.asyncio
async def test_generate_answer_forced_llm_failure_shows_unavailable_and_parent_chunk():
    """Verify that when LLM fails, it displays unavailable notice and uses parent chunk."""
    from unittest.mock import patch

    from llm.client import generate_answer
    from services.rag import RetrievedContext

    ctx = RetrievedContext(
        chunk_id=uuid.uuid4(),
        parent_chunk_id=uuid.uuid4(),
        note_id=uuid.uuid4(),
        note_title="Neural-Networks.pdf",
        page_id=uuid.uuid4(),
        page_number=13,
        page_image_path="storage/pages/test/p13.png",
        bbox_x=0.1,
        bbox_y=0.2,
        bbox_width=0.8,
        bbox_height=0.3,
        child_content="rules. Researchers are explored different neural network architectures.",
        parent_content=(
            "Section 4.2 Artificial Neural Networks: Classification and Architecture rules. "
            "Researchers are explored different neural network architectures and used for "
            "various applications. Therefore the classification of artificial neural networks "
            "can be done based on structures and based on type of data."
        ),
        distance=0.3,
        score=0.85,
    )

    # Force LLM exception (e.g. rate limit / network error / invalid key)
    with patch(
        "llm.client._call_llm_text",
        side_effect=RuntimeError("Quota exceeded: 429 Resource Exhausted"),
    ):
        ans, cites = await generate_answer("Explain neural network", [ctx])

    # 1. Must never present a fake generated answer
    assert "Generated from your uploaded course materials" not in ans
    # 2. Must show clear unavailable message with failure cause
    assert "The AI model is unavailable right now" in ans
    assert "Quota exceeded: 429" in ans
    # 3. Must use the parent chunk excerpt, never the child chunk
    assert "Section 4.2 Artificial Neural Networks" in ans
    # 4. Citations must still be attached so user can view source
    assert len(cites) == 1
    assert cites[0].page_number == 13


@pytest.mark.asyncio
async def test_chat_modes_ai_only_and_hybrid():
    """Verify ai_only mode (no citations) and hybrid mode (blends context)."""
    from unittest.mock import patch

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        chat_res = await ac.post("/api/v1/chats", json={"title": "Mode Test Chat"})
        assert chat_res.status_code == 201
        chat_id = chat_res.json()["id"]

        # 1. ai_only mode: answers without citations
        with patch(
            "llm.client._call_llm_text",
            return_value="General knowledge answer on gravity.",
        ):
            res_ai = await ac.post(
                f"/api/v1/chats/{chat_id}/messages",
                json={"content": "What is gravity?", "mode": "ai_only"},
            )
        assert res_ai.status_code == 201
        data_ai = res_ai.json()["message"]
        assert "General knowledge answer on gravity." in data_ai["content"]
        assert len(data_ai["citations"]) == 0

        # 2. hybrid mode with empty context: answers from general knowledge
        with patch(
            "llm.client._call_llm_text",
            return_value="Black holes are spacetime regions. Not covered in notes.",
        ):
            res_hybrid = await ac.post(
                f"/api/v1/chats/{chat_id}/messages",
                json={"content": "What are black holes?", "mode": "hybrid"},
            )
        assert res_hybrid.status_code == 201
        data_hybrid = res_hybrid.json()["message"]
        assert "Black holes are spacetime regions." in data_hybrid["content"]
        assert len(data_hybrid["citations"]) == 0

        # 3. notes_only mode with empty context: returns deterministic guardrail
        res_notes_empty = await ac.post(
            f"/api/v1/chats/{chat_id}/messages",
            json={"content": "What are black holes?", "mode": "notes_only"},
        )
        assert res_notes_empty.status_code == 201
        assert "Not covered in your uploaded notes." in res_notes_empty.json()["message"]["content"]

        # Cleanup
        await ac.delete(f"/api/v1/chats/{chat_id}")


@pytest.mark.asyncio
async def test_retrieval_tuning_broad_questions_and_user_scoping(caplog):
    """
    Unit B verification:
      - 'Explain neural network' retrieves definition and architecture chunks across pages.
      - Chunks are logged with scores and ranks.
      - Strict scoping: other users' notes are never retrieved.
    """
    import logging

    from services.rag import rag_service

    # 1. Create a 2-page PDF for mock_user (definition on page 1, architecture on page 2)
    doc_user = fitz.open()
    p1 = doc_user.new_page()
    p1.insert_text(
        fitz.Point(50, 72),
        "Artificial neural networks (ANN) are computational models.\n"
        "An artificial neural network is defined as a collection of connected artificial neurons.",
    )
    p2 = doc_user.new_page()
    p2.insert_text(
        fitz.Point(50, 72),
        "Deep Neural Network Architecture:\n"
        "The architecture consists of an input layer, hidden layers, and an output layer.",
    )
    pdf_user_bytes = doc_user.tobytes()
    doc_user.close()

    # 2. Create a PDF for other user
    doc_other = fitz.open()
    p_other = doc_other.new_page()
    p_other.insert_text(
        fitz.Point(50, 72),
        "Secret neural network research and classified architecture notes.",
    )
    pdf_other_bytes = doc_other.tobytes()
    doc_other.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Upload mock_user's note
        app.dependency_overrides[current_user] = lambda: mock_user
        res_u = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("Neural-Networks.pdf", io.BytesIO(pdf_user_bytes), "application/pdf")},
        )
        assert res_u.status_code == 201
        user_note_id = uuid.UUID(res_u.json()["data"]["id"])
        await ingestion_service.process_note(user_note_id)

        # Upload other user's note
        app.dependency_overrides[current_user] = lambda: mock_other_user
        res_o = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("Secret-NN.pdf", io.BytesIO(pdf_other_bytes), "application/pdf")},
        )
        assert res_o.status_code == 201
        other_note_id = uuid.UUID(res_o.json()["data"]["id"])
        await ingestion_service.process_note(other_note_id)

        # Restore current user to mock_user
        app.dependency_overrides[current_user] = lambda: mock_user

    # 3. Retrieve context for broad query "Explain neural network"
    with caplog.at_level(logging.INFO, logger="supernotes.rag"):
        async with async_session_factory() as session:
            contexts = await rag_service.retrieve_relevant_context(
                db=session,
                user_id=mock_user.id,
                query="Explain neural network",
            )

    # Scoping check: must never retrieve chunks from other user's note
    retrieved_note_ids = {c.note_id for c in contexts}
    assert other_note_id not in retrieved_note_ids
    assert user_note_id in retrieved_note_ids

    # Multi-page check: must retrieve definition (page 1) and architecture (page 2)
    pages = {c.page_number for c in contexts if c.note_id == user_note_id}
    assert 1 in pages, "Page 1 definition chunk should be retrieved"
    assert 2 in pages, "Page 2 architecture chunk should be retrieved"

    # Definition boosting check: page 1 definition chunk has definition boost
    p1_chunks = [c for c in contexts if c.page_number == 1]
    assert len(p1_chunks) > 0
    assert any("defined as" in c.child_content for c in p1_chunks)

    # Logging check: rank and scores must be logged
    rag_logs = [rec.message for rec in caplog.records if "supernotes.rag" in rec.name]
    assert any("Hybrid RAG retrieval complete" in m for m in rag_logs)
    assert any("Rank #1" in m for m in rag_logs)

    # Cleanup notes
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        app.dependency_overrides[current_user] = lambda: mock_user
        await ac.delete(f"/api/v1/notes/{user_note_id}")
        app.dependency_overrides[current_user] = lambda: mock_other_user
        await ac.delete(f"/api/v1/notes/{other_note_id}")
        app.dependency_overrides[current_user] = lambda: mock_user


@pytest.mark.asyncio
async def test_unit_c_sentence_aware_chunking_and_reindexing():
    """
    Unit C verification:
      - Chunks snap strictly to sentence boundaries (no mid-sentence start or end).
      - Fragmented slide lines are merged into paragraphs.
      - Page numbers and bounding box coordinates are retained.
      - Re-indexing script updates database chunks correctly.
    """
    from scripts.reindex_notes import reindex_note

    from services.chunker import chunker

    sample_slide_text = (
        "Deep Learning\n"
        "Chapter 4: Neural Networks\n"
        "Artificial neural networks (ANN) are computational\n"
        "models inspired by biological neurons.\n"
        "An artificial neural network is defined as a network of nodes.\n\n"
        "Researchers have explored different neural network architectures.\n"
        "Therefore the classification of artificial neural networks can be done\n"
        "based on structures and based on type of data.\n"
        "A single neuron can perform a simple pattern classification."
    )

    parents = chunker.chunk_text(sample_slide_text, page_number=13)
    assert len(parents) > 0

    for p in parents:
        # Parent chunk must be well-formed
        assert not p.content.startswith("rules.")
        assert len(p.children) > 0
        for c in p.children:
            # Child chunk must start with capital letter or title and end with terminal punctuation
            first_char = c.content.strip()[0]
            assert first_char.isupper() or first_char in ("#", "•", "-")
            last_char = c.content.strip()[-1]
            assert last_char in (".", "!", "?", ":")
            # Must retain page number and bounding box coordinates
            assert c.page_number == 13
            assert c.bbox_x > 0
            assert c.bbox_y > 0
            assert c.bbox_width > 0
            assert c.bbox_height > 0

    # Test re-indexing a real note in Postgres
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        fitz.Point(50, 72),
        "Section 1: Perceptrons.\n"
        "A perceptron is a single-layer artificial neural network.\n"
        "It maps its inputs to an output value using an activation function.",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        upload_res = await ac.post(
            "/api/v1/notes/upload",
            files={"file": ("Perceptrons.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        )
        assert upload_res.status_code == 201
        note_id = uuid.UUID(upload_res.json()["data"]["id"])
        await ingestion_service.process_note(note_id)

        # Run re-indexing script
        async with async_session_factory() as session:
            chunks_reindexed = await reindex_note(note_id, session)
        assert chunks_reindexed > 0

        # Ask question and verify citations scroll viewer with valid bbox
        chat_res = await ac.post("/api/v1/chats", json={"title": "Reindex Test"})
        chat_id = chat_res.json()["id"]

        ask_res = await ac.post(
            f"/api/v1/chats/{chat_id}/messages",
            json={"content": "Explain perceptron", "mode": "hybrid"},
        )
        assert ask_res.status_code == 201
        ans_msg = ask_res.json()["message"]
        assert len(ans_msg["citations"]) > 0
        cit = ans_msg["citations"][0]
        assert cit["page_number"] == 1
        assert cit["bbox_x"] is not None
        assert cit["bbox_y"] is not None

        # Cleanup
        await ac.delete(f"/api/v1/notes/{note_id}")
        await ac.delete(f"/api/v1/chats/{chat_id}")




