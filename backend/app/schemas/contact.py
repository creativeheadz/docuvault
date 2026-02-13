import uuid
from datetime import datetime
from pydantic import BaseModel


class ContactCreate(BaseModel):
    organization_id: uuid.UUID
    first_name: str
    last_name: str
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    is_primary: bool = False
    notes: str | None = None


class ContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    is_primary: bool | None = None
    notes: str | None = None


class ContactResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    first_name: str
    last_name: str
    title: str | None
    email: str | None
    phone: str | None
    mobile: str | None
    is_primary: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
