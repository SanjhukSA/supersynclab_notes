"""
Pydantic schemas for User Settings and LLM Provider configuration.
"""

from pydantic import BaseModel, ConfigDict, Field


class LLMSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    active_provider: str  # "gemini" | "openai" | "anthropic"
    active_model: str | None = None
    has_gemini_key: bool = False
    has_openai_key: bool = False
    has_anthropic_key: bool = False
    masked_key: str | None = None


class LLMSettingsUpdateRequest(BaseModel):
    provider: str = Field(..., pattern="^(gemini|openai|anthropic)$")
    model: str | None = None
    api_key: str | None = None  # None or "" to leave unchanged; "RESET" to delete


class TestConnectionRequest(BaseModel):
    provider: str = Field(..., pattern="^(gemini|openai|anthropic)$")
    api_key: str = Field(..., min_length=4)
    model: str | None = None


class TestConnectionResponse(BaseModel):
    success: bool
    provider: str
    model: str | None = None
    message: str | None = None
    reply: str | None = None
    error: str | None = None
