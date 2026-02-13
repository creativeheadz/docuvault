import uuid
from datetime import datetime
from pydantic import BaseModel


class PasswordCategoryCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None = None


class PasswordCategoryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class PasswordCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    url: str | None = None
    username: str | None = None
    password_value: str | None = None  # plaintext, will be encrypted
    notes: str | None = None
    category_id: uuid.UUID | None = None


class PasswordUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    username: str | None = None
    password_value: str | None = None
    notes: str | None = None
    category_id: uuid.UUID | None = None


class PasswordResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    url: str | None
    username: str | None
    notes: str | None
    category_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PasswordRevealResponse(BaseModel):
    password: str


class PasswordAccessLogResponse(BaseModel):
    id: uuid.UUID
    password_id: uuid.UUID
    user_id: uuid.UUID
    action: str
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
