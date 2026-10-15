from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services import assistant_settings

router = APIRouter(prefix="/assistant", tags=["assistant"])

# Mirrors assistant_settings.PROVIDERS. The service checks membership too, so
# a new provider added there but forgotten here still fails closed (422).
ProviderId = Literal["anthropic", "deepseek", "ionos", "muse"]

MODEL_PATTERN = r"^[A-Za-z0-9._:@/-]+$"


class AssistantSettingsIn(BaseModel):
    provider: ProviderId = "anthropic"
    model: str = Field(..., min_length=3, max_length=100, pattern=MODEL_PATTERN)
    api_key: str | None = Field(None, max_length=500)   # blank keeps the stored key
    clear_key: bool = False                               # fall back to the environment's
    max_output_tokens: int = assistant_settings.DEFAULT_MAX_OUTPUT
    effort: str | None = None


class AssistantTestIn(BaseModel):
    """What the settings page currently shows. Anything left out falls back
    to the saved settings, then the environment; a key here is used once."""

    provider: ProviderId | None = None
    model: str | None = Field(None, min_length=1, max_length=100, pattern=MODEL_PATTERN)
    api_key: str | None = Field(None, max_length=500)
    max_output_tokens: int | None = None
    effort: str | None = None


@router.get("/settings")
async def get_assistant_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    return await assistant_settings.public(db)


@router.put("/settings")
async def save_assistant_settings(
    body: AssistantSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return await assistant_settings.save(
            db, provider=body.provider, model=body.model, api_key=body.api_key,
            clear_key=body.clear_key, max_output_tokens=body.max_output_tokens,
            effort=body.effort,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/test")
async def test_assistant(
    body: AssistantTestIn | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    overrides = body.model_dump(exclude_unset=True) if body else None
    return await assistant_settings.test(db, overrides)
