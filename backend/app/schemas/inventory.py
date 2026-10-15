import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PushedDevice(BaseModel):
    """One machine as Wegweiser knows it."""
    # Wegweiser's deviceuuid. Stable for an install of the agent.
    external_id: str = Field(..., min_length=1, max_length=64)
    # DocuVault organisations linked to the device's Wegweiser organisation,
    # most likely home first: an existing system is looked for in all of
    # them, a new one is created in the first.
    organization_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=25)
    name: str = Field(..., min_length=1, max_length=255)
    hostname: str | None = Field(None, max_length=255)
    category: str | None = Field(None, max_length=100)
    operating_system: str | None = Field(None, max_length=255)
    os_version: str | None = Field(None, max_length=100)
    manufacturer: str | None = Field(None, max_length=255)
    model: str | None = Field(None, max_length=255)
    serial_number: str | None = Field(None, max_length=255)
    system_uuid: str | None = Field(None, max_length=64)
    # Burned-in MACs, any separators.
    mac_addresses: list[str] = Field(default_factory=list, max_length=32)
    ip_address: str | None = Field(None, max_length=100)
    online: bool | None = None
    last_seen_at: datetime | None = None
    health_score: float | None = Field(None, ge=0, le=100)
    agent_version: str | None = Field(None, max_length=50)
    group: str | None = Field(None, max_length=255)
    url: str | None = Field(None, max_length=500)


class InventoryPush(BaseModel):
    devices: list[PushedDevice] = Field(..., max_length=2000)


class SkippedDevice(BaseModel):
    external_id: str
    reason: str


class PushResult(BaseModel):
    received: int = 0
    created: int = 0
    # Matched a system that was already here (typically from MeshCentral)
    # and linked it, rather than adding a second record for one machine.
    linked: int = 0
    updated: int = 0
    skipped: list[SkippedDevice] = []
