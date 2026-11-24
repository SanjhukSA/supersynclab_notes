"""
Application settings loaded from environment variables and the root .env file.
Uses pydantic-settings so every value is validated at startup.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env file lives at the project root, two levels above this file
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",  # ignore env vars we don't need
    )

    # ── Clerk auth ────────────────────────────────────────────────────────
    clerk_publishable_key: str = ""
    clerk_secret_key: str = ""

    # ── Gemini AI ─────────────────────────────────────────────────────────
    gemini_api_key: str = ""

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://supernotes:supernotes@localhost:5433/supernotes"

    # ── Redis ─────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── File storage ──────────────────────────────────────────────────────
    storage_dir: str = "./storage"

    # ── CORS ──────────────────────────────────────────────────────────────
    frontend_url: str = "http://localhost:5173"

    @property
    def sync_database_url(self) -> str:
        """Alembic needs a synchronous URL (psycopg2 or plain postgresql)."""
        return self.database_url.replace("+asyncpg", "")


settings = Settings()
