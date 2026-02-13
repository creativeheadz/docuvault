import uuid
from datetime import datetime, date
from pydantic import BaseModel


class DomainCreate(BaseModel):
    organization_id: uuid.UUID
    domain_name: str
    registrar: str | None = None
    registration_date: date | None = None
    expiration_date: date | None = None
    auto_renew: bool = False
    dns_records: dict | None = None
    notes: str | None = None


class DomainUpdate(BaseModel):
    domain_name: str | None = None
    registrar: str | None = None
    registration_date: date | None = None
    expiration_date: date | None = None
    auto_renew: bool | None = None
    dns_records: dict | None = None
    notes: str | None = None


class DomainResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    domain_name: str
    registrar: str | None
    registration_date: date | None
    expiration_date: date | None
    auto_renew: bool
    dns_records: dict | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
