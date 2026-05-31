from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services import uptime_service

router = APIRouter(prefix="/uptime", tags=["uptime"])


# --- Schemas ---

class UptimeSettingsIn(BaseModel):
    url: str
    api_key: str = ""  # blank on edit keeps the stored key


class UptimeSettingsOut(BaseModel):
    url: str | None = None
    api_key_set: bool = False
    configured: bool = False


class UptimeTestResult(BaseModel):
    success: bool
    monitor_count: int = 0
    error: str | None = None


class UptimeMonitor(BaseModel):
    id: str
    name: str
    type: str | None = None
    url: str | None = None
    hostname: str | None = None
    port: str | None = None
    status: int | None = None
    status_label: str
    response_time: int | None = None
    cert_days_remaining: int | None = None
    cert_is_valid: bool | None = None


class UptimeSummary(BaseModel):
    total: int = 0
    up: int = 0
    down: int = 0
    pending: int = 0
    maintenance: int = 0


class UptimeMonitorsOut(BaseModel):
    configured: bool = False
    monitors: list[UptimeMonitor] = []
    summary: UptimeSummary = Field(default_factory=UptimeSummary)
    error: str | None = None


# --- Endpoints ---

@router.get("/settings", response_model=UptimeSettingsOut)
async def get_uptime_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await uptime_service.get_settings(db)


@router.put("/settings", response_model=UptimeSettingsOut)
async def save_uptime_settings(
    body: UptimeSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await uptime_service.save_settings(db, body.url, body.api_key)


@router.post("/test", response_model=UptimeTestResult)
async def test_uptime(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return UptimeTestResult(**await uptime_service.test(db))


@router.get("/monitors", response_model=UptimeMonitorsOut)
async def list_monitors(
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return UptimeMonitorsOut(**await uptime_service.fetch_monitors(db, force=force))
