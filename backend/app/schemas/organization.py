import uuid
from datetime import datetime
from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str
    description: str | None = None
    parent_id: uuid.UUID | None = None
    logo_url: str | None = None
    website: str | None = None
    phone: str | None = None
    address: str | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_id: uuid.UUID | None = None
    logo_url: str | None = None
    website: str | None = None
    phone: str | None = None
    address: str | None = None


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    parent_id: uuid.UUID | None
    logo_url: str | None
    website: str | None
    phone: str | None
    address: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    mesh_id: str | None = None

    model_config = {"from_attributes": True}


class OrganizationListResponse(BaseModel):
    items: list[OrganizationResponse]
    total: int
    page: int
    page_size: int
