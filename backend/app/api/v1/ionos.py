from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services import ionos_service

router = APIRouter(prefix="/ionos", tags=["ionos"])


# --- Schemas ---

class IonosSettingsIn(BaseModel):
    prefix: str
    secret: str


class IonosSettingsOut(BaseModel):
    prefix: str | None = None
    secret_set: bool = False
    configured: bool = False


class IonosTestResult(BaseModel):
    success: bool
    domain_count: int = 0
    error: str | None = None


class IonosDomain(BaseModel):
    id: str | None = None
    name: str | None = None
    tld: str | None = None
    expiration_date: str | None = None
    auto_renew: bool | None = None
    status: str | None = None
    days_until_expiry: int | None = None


class IonosDomainsOut(BaseModel):
    configured: bool = False
    domains: list[IonosDomain] = []
    error: str | None = None


# --- Endpoints ---

@router.get("/settings", response_model=IonosSettingsOut)
async def get_ionos_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return IonosSettingsOut(**await ionos_service.get_settings(db))


@router.put("/settings", response_model=IonosSettingsOut)
async def save_ionos_settings(
    body: IonosSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return IonosSettingsOut(
        **await ionos_service.save_settings(db, body.prefix.strip(), body.secret.strip())
    )


@router.post("/test", response_model=IonosTestResult)
async def test_ionos_connection(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return IonosTestResult(**await ionos_service.test_connection(db))


@router.get("/domains", response_model=IonosDomainsOut)
async def list_ionos_domains(
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    settings = await ionos_service.get_settings(db)
    if not settings["configured"]:
        return IonosDomainsOut(configured=False)
    try:
        raw = await ionos_service.list_domains(db, force=force)
    except Exception as exc:  # noqa: BLE001 — degrade gracefully for the card
        return IonosDomainsOut(configured=True, error=str(exc))

    now = datetime.now(timezone.utc)
    domains: list[IonosDomain] = []
    for d in raw:
        days: int | None = None
        if d.get("expiration_date"):
            try:
                exp = datetime.fromisoformat(
                    d["expiration_date"].replace("Z", "+00:00")
                )
                days = (exp - now).days
            except ValueError:
                days = None
        domains.append(IonosDomain(**d, days_until_expiry=days))
    return IonosDomainsOut(configured=True, domains=domains)
