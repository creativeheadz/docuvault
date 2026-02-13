import uuid
from datetime import datetime
from pydantic import BaseModel


class LocationCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    phone: str | None = None
    fax: str | None = None
    is_primary: bool = False
    notes: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None
    phone: str | None = None
    fax: str | None = None
    is_primary: bool | None = None
    notes: str | None = None


class LocationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    zip_code: str | None
    country: str | None
    phone: str | None
    fax: str | None
    is_primary: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
