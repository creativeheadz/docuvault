from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services import assistant_settings

router = APIRouter(prefix="/assistant", tags=["assistant"])


class AssistantSettingsIn(BaseModel):
    model: str = Field(..., min_length=3, max_length=100, pattern=r"^[A-Za-z0-9._:@/-]+$")
    api_key: str | None = Field(None, max_length=500)   # blank keeps the stored key
    clear_key: bool = False                               # fall back to the environment's
    max_output_tokens: int = assistant_settings.DEFAULT_MAX_OUTPUT
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
    return await assistant_settings.save(
        db, model=body.model, api_key=body.api_key, clear_key=body.clear_key,
        max_output_tokens=body.max_output_tokens, effort=body.effort,
    )


@router.post("/test")
async def test_assistant(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    return await assistant_settings.test(db)
