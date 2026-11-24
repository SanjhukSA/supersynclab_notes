import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from db.models import User
from deps import current_user
from main import app

mock_user_id = uuid.uuid4()
mock_user = User(
    id=mock_user_id,
    clerk_id=f"user_synth_{mock_user_id.hex[:8]}",
    email="synth_student@example.edu",
    display_name="Synthesis Student",
    avatar_url=None,
)


@pytest.fixture
def override_user():
    app.dependency_overrides[current_user] = lambda: mock_user
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_synthesis_endpoints_validation(override_user):
    """Test validation when no note_ids or folder_id are provided."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Missing scope in cheatsheet synthesis
        res1 = await ac.post("/api/v1/study/synthesize/cheatsheet", json={})
        assert res1.status_code == 400
        assert res1.json()["detail"]["code"] == "missing_scope"

        # 2. Missing scope in quiz synthesis
        res2 = await ac.post("/api/v1/study/synthesize/quiz", json={})
        assert res2.status_code == 400
        assert res2.json()["detail"]["code"] == "missing_scope"

        # 3. Non-existent note IDs
        fake_id = str(uuid.uuid4())
        res3 = await ac.post(
            "/api/v1/study/synthesize/cheatsheet",
            json={"note_ids": [fake_id]},
        )
        assert res3.status_code == 404
        assert res3.json()["detail"]["code"] == "no_notes_found"
