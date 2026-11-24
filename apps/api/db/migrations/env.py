"""
Alembic migration environment (asyncpg compatible).

Uses asyncpg with SQLAlchemy async engine so no separate synchronous
Postgres driver is required.
"""

import asyncio
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import create_async_engine

# Add the api directory to the Python path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from config import settings
from db.models import Base

config = context.config

# Set async database URL (escape '%' to prevent configparser interpolation errors)
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        # Ensure pgvector extension exists before creating tables
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        context.run_migrations()


async def run_async_migrations():
    """Run migrations in 'online' mode with asyncpg."""
    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
