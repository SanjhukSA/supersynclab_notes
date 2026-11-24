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
    clerk_id=f"user_settings_{mock_user_id.hex[:8]}",
    email="settings_student@example.edu",
    display_name="Settings Student",
    avatar_url=None,
)


@pytest.fixture
async def setup_test_user():
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
async def test_llm_settings_get_and_update(setup_test_user):
    """Test retrieving and saving custom LLM provider settings."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Get settings
        get_res = await ac.get("/api/v1/settings/llm")
        assert get_res.status_code == 200
        data = get_res.json()
        assert "active_provider" in data

        # 2. Update to OpenAI with custom key
        update_res = await ac.put(
            "/api/v1/settings/llm",
            json={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-proj-test1234567890abcdef",
            },
        )
        assert update_res.status_code == 200
        u_data = update_res.json()
        assert u_data["active_provider"] == "openai"
        assert u_data["active_model"] == "gpt-4o-mini"
        assert u_data["has_openai_key"] is True
        assert u_data["masked_key"] == "sk-p...cdef"


@pytest.mark.asyncio
async def test_test_connection_endpoint(setup_test_user):
    """Test the test-connection endpoint with a mock invalid key."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post(
            "/api/v1/settings/test-connection",
            json={
                "provider": "openai",
                "api_key": "sk-invalid-test-key",
                "model": "gpt-4o-mini",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["provider"] == "openai"
        # Since this key is fake, success will be False and an error will be returned
        assert "success" in data


def test_gemini_candidate_resolution():
    """Verify that deprecated bare model names are mapped to working aliases."""
    from llm.client import _resolve_gemini_candidates

    # Deprecated bare alias automatically normalizes to latest
    cands_flash = _resolve_gemini_candidates("gemini-1.5-flash")
    assert cands_flash[0] == "gemini-1.5-flash-latest"
    assert "gemini-1.5-flash-002" in cands_flash
    assert "gemini-2.0-flash" in cands_flash

    # Explicit gemini-2.0-flash is prioritized first
    cands_20 = _resolve_gemini_candidates("gemini-2.0-flash")
    assert cands_20[0] == "gemini-2.0-flash"

    # Bare pro normalizes to latest
    cands_pro = _resolve_gemini_candidates("gemini-1.5-pro")
    assert cands_pro[0] == "gemini-1.5-pro-latest"
