from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services import registrar_service
from app.services.registrars import REGISTRY, RegistrarError

router = APIRouter(prefix="/registrars", tags=["registrars"])


# --- Schemas ---

class FieldMeta(BaseModel):
    name: str
    label: str
    secret: bool
    optional: bool
    placeholder: str


class ProviderStatus(BaseModel):
    key: str
    label: str
    fields: list[FieldMeta]
    set_fields: list[str]
    configured: bool
    supports_dns: bool = False


class SaveSettingsIn(BaseModel):
    values: dict[str, str]


class SaveSettingsOut(BaseModel):
    key: str
    label: str
    configured: bool


class TestResult(BaseModel):
    success: bool
    domain_count: int = 0
    error: str | None = None


class RegistrarDomain(BaseModel):
    name: str
    provider: str
    provider_label: str
    expiration_date: str | None = None
    auto_renew: bool | None = None
    status: str | None = None
    days_until_expiry: int | None = None
    supports_dns: bool = False


class DnsRecordModel(BaseModel):
    id: str | None = None
    name: str
    type: str
    content: str
    ttl: int | None = None
    prio: int | None = None
    disabled: bool = False
    root_name: str | None = None
    change_date: str | None = None


class DnsRecordIn(BaseModel):
    name: str
    type: str
    content: str
    ttl: int | None = None
    prio: int | None = None
    disabled: bool = False


class DnsListOut(BaseModel):
    domain: str
    records: list[DnsRecordModel] = []


class DomainsOut(BaseModel):
    configured: list[str] = []
    domains: list[RegistrarDomain] = []
    errors: dict[str, str] = {}


# --- Endpoints ---

@router.get("/providers", response_model=list[ProviderStatus])
async def list_providers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await registrar_service.get_status(db)


@router.put("/{provider_key}/settings", response_model=SaveSettingsOut)
async def save_provider_settings(
    provider_key: str,
    body: SaveSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if provider_key not in REGISTRY:
        raise HTTPException(status_code=404, detail="Unknown registrar")
    try:
        return await registrar_service.save(db, provider_key, body.values)
    except RegistrarError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{provider_key}/test", response_model=TestResult)
async def test_provider(
    provider_key: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return TestResult(**await registrar_service.test(db, provider_key))


@router.get("/domains", response_model=DomainsOut)
async def list_domains(
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await registrar_service.list_all(db, force=force)
    now = datetime.now(timezone.utc)
    domains: list[RegistrarDomain] = []
    for d in result["domains"]:
        days: int | None = None
        if d.get("expiration_date"):
            try:
                exp = datetime.fromisoformat(
                    str(d["expiration_date"]).replace("Z", "+00:00")
                )
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                days = (exp - now).days
            except ValueError:
                days = None
        domains.append(RegistrarDomain(**d, days_until_expiry=days))
    return DomainsOut(
        configured=result["configured"],
        domains=domains,
        errors=result["errors"],
    )


# --- DNS ---

@router.get("/{provider_key}/dns", response_model=DnsListOut)
async def list_dns(
    provider_key: str,
    domain: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        records = await registrar_service.list_dns(db, provider_key, domain)
    except RegistrarError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DnsListOut(domain=domain, records=records)


@router.post("/{provider_key}/dns", status_code=201)
async def create_dns(
    provider_key: str,
    domain: str,
    body: DnsRecordIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        await registrar_service.create_dns(
            db, provider_key, domain, body.model_dump()
        )
    except RegistrarError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@router.put("/{provider_key}/dns/{record_id}")
async def update_dns(
    provider_key: str,
    record_id: str,
    domain: str,
    body: DnsRecordIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        await registrar_service.update_dns(
            db, provider_key, domain, record_id, body.model_dump()
        )
    except RegistrarError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@router.delete("/{provider_key}/dns/{record_id}")
async def delete_dns(
    provider_key: str,
    record_id: str,
    domain: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        await registrar_service.delete_dns(db, provider_key, domain, record_id)
    except RegistrarError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}
