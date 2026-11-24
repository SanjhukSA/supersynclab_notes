"""
FastAPI dependency injection — auth verification and shared dependencies.

Every protected route uses `current_user` to get the authenticated User row.
The dependency verifies the Clerk JWT, extracts the clerk_id, and looks up
(or auto-creates) the corresponding user in our database.
"""

import logging
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import User, UserSettings
from db.session import get_db
from llm.client import LLMConfig

logger = logging.getLogger("supernotes.auth")

# ── Clerk JWKS cache ─────────────────────────────────────────────────────
# We fetch Clerk's public keys once and reuse them. In production you'd
# refresh periodically, but for dev this is fine.
_jwks_client: jwt.PyJWKClient | None = None


def _get_jwks_client() -> jwt.PyJWKClient:
    """Lazily create and cache the JWKS client for Clerk token verification."""
    global _jwks_client
    if _jwks_client is None:
        # Clerk's JWKS endpoint is derived from the publishable key.
        # Format: pk_test_<base64-encoded-frontend-api>
        # The frontend API domain is the base64-decoded portion + ".clerk.accounts.dev"
        # But the simpler approach is to use the Clerk API directly.
        jwks_url = f"https://{_get_clerk_domain()}/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(jwks_url)
    return _jwks_client


def _get_clerk_domain() -> str:
    """Extract the Clerk frontend API domain from the publishable key."""
    import base64

    # pk_test_<base64>  or  pk_live_<base64>
    key = settings.clerk_publishable_key
    # Remove the pk_test_ or pk_live_ prefix
    encoded = key.split("_", 2)[-1]  # e.g. "dGVzdC5jbGVyay5hY2NvdW50cy5kZXY="
    # Add padding if needed
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding
    try:
        domain = base64.b64decode(encoded).decode("utf-8").rstrip("$")
        return domain
    except Exception:
        # Fallback: use a placeholder that will fail gracefully
        logger.warning("Could not decode Clerk domain from publishable key")
        return "clerk.placeholder.dev"


def _extract_bearer_token(request: Request) -> str:
    """Pull the JWT from the Authorization: Bearer <token> header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_token", "message": "Authorization header required"},
        )
    return auth_header[7:]  # strip "Bearer "


async def _verify_clerk_token(token: str) -> dict:
    """
    Verify a Clerk JWT and return its decoded payload.
    Raises HTTPException if the token is invalid or expired.
    """
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't set aud by default
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "token_expired", "message": "Session expired, please sign in again"},
        ) from None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid Clerk token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Invalid authentication token"},
        ) from e


async def current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency: verify the Clerk JWT and return the User row.

    If the user doesn't exist in our database yet (first sign-in),
    we auto-create them from the Clerk token claims.
    """
    token = _extract_bearer_token(request)
    payload = await _verify_clerk_token(token)

    clerk_id = payload.get("sub", "")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "no_subject", "message": "Token missing user identifier"},
        )

    # Look up the user by their Clerk ID
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    if user is None:
        # First sign-in: auto-create the user from token claims
        email_from_list = payload.get("email_addresses", [{}])[0].get("email_address", "")
        email = payload.get("email") or email_from_list
        user = User(
            clerk_id=clerk_id,
            email=email,
            display_name=payload.get("name", payload.get("first_name", "")),
            avatar_url=payload.get("image_url", payload.get("profile_image_url")),
        )
        db.add(user)
        await db.flush()  # assign the id without committing
        logger.info(f"Auto-created user from Clerk: {clerk_id}")

    return user


# Type alias for cleaner route signatures
CurrentUser = Annotated[User, Depends(current_user)]


async def get_llm_config(
    request: Request,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LLMConfig:
    """
    Extract LLM configuration for the current user.

    Order of precedence:
      1. Request headers: X-LLM-Key, X-LLM-Provider, X-LLM-Model (from frontend localStorage)
      2. User settings saved in database
      3. Server-side default (.env GEMINI_API_KEY)
    """
    h_provider = request.headers.get("x-llm-provider")
    h_key = request.headers.get("x-llm-key")
    h_model = request.headers.get("x-llm-model")

    if h_key:
        return LLMConfig(
            provider=h_provider or "gemini",
            api_key=h_key,
            model=h_model or None,
        )

    # Database user_settings lookup
    try:
        stmt = select(UserSettings).where(UserSettings.user_id == user.id)
        res = await db.execute(stmt)
        u_settings = res.scalar_one_or_none()
        if u_settings:
            provider = u_settings.llm_provider or "gemini"
            key = None
            if provider == "openai":
                key = u_settings.openai_api_key
            elif provider == "anthropic":
                key = u_settings.anthropic_api_key
            else:
                key = u_settings.gemini_api_key

            return LLMConfig(
                provider=provider,
                api_key=key,
                model=u_settings.llm_model,
            )
    except Exception as e:
        logger.debug(f"Could not read user_settings from db: {e}")

    # Server default fallback
    is_valid_default = bool(
        settings.gemini_api_key
        and not settings.gemini_api_key.startswith("PLACEHOLDER")
        and len(settings.gemini_api_key) > 20
    )
    return LLMConfig(
        provider="gemini",
        api_key=settings.gemini_api_key if is_valid_default else None,
        model="gemini-1.5-flash",
    )


ActiveLLMConfig = Annotated[LLMConfig, Depends(get_llm_config)]
