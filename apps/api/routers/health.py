"""
Health-check routes — used to verify the API is running and services are reachable.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_db
from deps import CurrentUser

router = APIRouter()


@router.get("/health")
async def health_check():
    """Public health check — no auth required."""
    return {"status": "ok", "app": "SuperNotes", "version": "1.0.0"}


@router.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db)):
    """Check that the database connection works."""
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}


@router.get("/health/me")
async def health_me(user: CurrentUser):
    """Protected endpoint — returns the authenticated user's info.
    Used by the frontend to verify the auth flow works end to end."""
    return {
        "status": "ok",
        "user": {
            "id": str(user.id),
            "clerk_id": user.clerk_id,
            "email": user.email,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
        },
    }
