"""
SuperNotes API — FastAPI application entry point.

Run from the apps/api/ directory:
    uvicorn main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from routers import chat, folders, google_sync, health, notes, sharing, study
from routers import settings as settings_router

# ── Logging ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("supernotes")


# ── Lifespan: startup / shutdown ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run setup on startup, cleanup on shutdown."""
    logger.info("SuperNotes API starting up")
    db_host = settings.database_url.split("@")[-1]
    logger.info(f"Database: {db_host}")
    logger.info(f"Frontend: {settings.frontend_url}")
    yield
    logger.info("SuperNotes API shutting down")


# ── App ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SuperNotes",
    description="AI-powered exam-cramming engine for students",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS — allow the Vite dev server ──────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────
# All routes are prefixed with /api/v1 as per code standards
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(settings_router.router, prefix="/api/v1/settings", tags=["Settings"])
app.include_router(folders.router, prefix="/api/v1/folders", tags=["Folders"])
app.include_router(notes.router, prefix="/api/v1/notes", tags=["Notes"])
app.include_router(study.router, prefix="/api/v1/study", tags=["Study Workflows"])
app.include_router(study.router, prefix="/api/v1/notes", tags=["Study Workflows (Notes)"])
app.include_router(chat.router, prefix="/api/v1/chats", tags=["Chat"])
app.include_router(sharing.router, prefix="/api/v1/share", tags=["Sharing"])
app.include_router(
    google_sync.router, prefix="/api/v1/integrations/google", tags=["Google Sync"]
)

# ── Static files — serve rendered pages and artifacts ────────────────────
app.mount("/storage", StaticFiles(directory=settings.storage_dir), name="storage")
