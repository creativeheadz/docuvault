import uuid
from datetime import datetime, date
from typing import Any
from pydantic import BaseModel


class ConfigurationCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    configuration_type: str | None = None
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    serial_number: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    warranty_expiration: date | None = None
    notes: str | None = None


class ConfigurationUpdate(BaseModel):
    name: str | None = None
    configuration_type: str | None = None
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    serial_number: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    warranty_expiration: date | None = None
    notes: str | None = None


class ConfigurationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    configuration_type: str | None
    hostname: str | None
    ip_address: str | None
    mac_address: str | None
    serial_number: str | None
    operating_system: str | None
    os_version: str | None
    manufacturer: str | None
    model: str | None
    warranty_expiration: date | None
    notes: str | None
    mesh_node_id: str | None = None
    mesh_agent_connected: bool | None = None
    mesh_last_sync_at: datetime | None = None
    mesh_extra: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
