import pytest_asyncio

from db.session import engine


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db_connections():
    """Dispose engine connections after each test so no connections linger across loops."""
    yield
    await engine.dispose()
