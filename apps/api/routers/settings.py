"""
Settings router — User LLM provider selection, custom API keys (BYOK), and connection testing.

Supports switching between Google Gemini, OpenAI (ChatGPT), and Anthropic (Claude).
"""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import UserSettings
from db.session import get_db
from deps import CurrentUser
from llm.client import test_llm_connection
from schemas.settings import (
    LLMSettingsResponse,
    LLMSettingsUpdateRequest,
    TestConnectionRequest,
    TestConnectionResponse,
)

router = APIRouter()


def _mask_key(key: str | None) -> str | None:
    if not key or len(key) < 8:
        return None
    return f"{key[:4]}...{key[-4:]}"


@router.get(
    "/llm",
    response_model=LLMSettingsResponse,
    summary="Get user LLM provider preferences and key status",
)
async def get_llm_settings(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsResponse:
    """Retrieve user's active LLM provider and whether keys are configured."""
    active_provider = "gemini"
    active_model = "gemini-1.5-flash-latest"
    has_gemini = bool(
        settings.gemini_api_key
        and not settings.gemini_api_key.startswith("PLACEHOLDER")
        and len(settings.gemini_api_key) > 20
    )
    has_openai = False
    has_anthropic = False
    current_key: str | None = None

    try:
        stmt = select(UserSettings).where(UserSettings.user_id == user.id)
        res = await db.execute(stmt)
        u_settings = res.scalar_one_or_none()

        if u_settings:
            active_provider = u_settings.llm_provider or "gemini"
            active_model = u_settings.llm_model or active_model
            if u_settings.gemini_api_key:
                has_gemini = True
            if u_settings.openai_api_key:
                has_openai = True
            if u_settings.anthropic_api_key:
                has_anthropic = True

            if active_provider == "openai":
                current_key = u_settings.openai_api_key
            elif active_provider == "anthropic":
                current_key = u_settings.anthropic_api_key
            else:
                current_key = u_settings.gemini_api_key or settings.gemini_api_key
    except Exception:
        pass

    return LLMSettingsResponse(
        active_provider=active_provider,
        active_model=active_model,
        has_gemini_key=has_gemini,
        has_openai_key=has_openai,
        has_anthropic_key=has_anthropic,
        masked_key=_mask_key(current_key),
    )


@router.put(
    "/llm",
    response_model=LLMSettingsResponse,
    summary="Update user LLM provider and custom API key",
)
async def update_llm_settings(
    req: LLMSettingsUpdateRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsResponse:
    """Save custom API key and provider preferences for the authenticated user."""
    stmt = select(UserSettings).where(UserSettings.user_id == user.id)
    res = await db.execute(stmt)
    u_settings = res.scalar_one_or_none()

    if not u_settings:
        u_settings = UserSettings(
            id=uuid.uuid4(),
            user_id=user.id,
            llm_provider=req.provider,
            llm_model=req.model,
        )
        db.add(u_settings)
    else:
        u_settings.llm_provider = req.provider
        if req.model is not None:
            u_settings.llm_model = req.model

    # Update or clear keys
    if req.api_key is not None:
        key_val = req.api_key.strip()
        if key_val == "RESET" or key_val == "":
            if req.provider == "gemini":
                u_settings.gemini_api_key = None
            elif req.provider == "openai":
                u_settings.openai_api_key = None
            elif req.provider == "anthropic":
                u_settings.anthropic_api_key = None
        else:
            if req.provider == "gemini":
                u_settings.gemini_api_key = key_val
            elif req.provider == "openai":
                u_settings.openai_api_key = key_val
            elif req.provider == "anthropic":
                u_settings.anthropic_api_key = key_val

    await db.commit()
    await db.refresh(u_settings)

    has_gemini = bool(
        u_settings.gemini_api_key
        or (
            settings.gemini_api_key
            and not settings.gemini_api_key.startswith("PLACEHOLDER")
            and len(settings.gemini_api_key) > 20
        )
    )

    current_key = None
    if req.provider == "openai":
        current_key = u_settings.openai_api_key
    elif req.provider == "anthropic":
        current_key = u_settings.anthropic_api_key
    else:
        current_key = u_settings.gemini_api_key or settings.gemini_api_key

    return LLMSettingsResponse(
        active_provider=u_settings.llm_provider,
        active_model=u_settings.llm_model,
        has_gemini_key=has_gemini,
        has_openai_key=bool(u_settings.openai_api_key),
        has_anthropic_key=bool(u_settings.anthropic_api_key),
        masked_key=_mask_key(current_key),
    )


@router.post(
    "/test-connection",
    response_model=TestConnectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Probe custom API key connection with a test prompt",
)
async def test_connection_endpoint(
    req: TestConnectionRequest,
    user: CurrentUser,
) -> TestConnectionResponse:
    """Test validity of a user-provided API key by sending a short test prompt."""
    result = await test_llm_connection(
        provider=req.provider,
        api_key=req.api_key.strip(),
        model=req.model,
    )

    return TestConnectionResponse(
        success=result.get("success", False),
        provider=req.provider,
        model=result.get("model"),
        message=result.get("message"),
        reply=result.get("reply"),
        error=result.get("error"),
    )
