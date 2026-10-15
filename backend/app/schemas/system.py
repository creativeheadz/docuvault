import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class _SystemFields(BaseModel):
    organization_id: uuid.UUID | None = None
    category: str | None = None
    short_description: str | None = None
    body: str | None = None
    tags: list[str] = Field(default_factory=list)
    snippets: dict[str, Any] = Field(default_factory=dict)
    palace_drawer_ids: list[str] = Field(default_factory=list)
    status: str = "active"
    color: str | None = None
    icon: str | None = None
    # Inventory
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    serial_number: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    warranty_expiration: date | None = None
    # Cyber Essentials evidence
    ce_in_scope: bool = True
    device_role: str | None = None
    software_firewall_on: bool | None = None
    malware_protection: str | None = None
    os_eol_date: date | None = None
    last_patched_date: date | None = None


class SystemCreate(_SystemFields):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = None
    # What a person (or the page acting for one) may say a new system came
    # from. A sync stamps its own name in code and is not on this list.
    source: Literal["manual", "map", "csv"] = "manual"


class SystemUpdate(BaseModel):
    """Every field optional; only the ones sent change."""
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = None
    organization_id: uuid.UUID | None = None
    category: str | None = None
    short_description: str | None = None
    body: str | None = None
    tags: list[str] | None = None
    snippets: dict[str, Any] | None = None
    palace_drawer_ids: list[str] | None = None
    status: str | None = None
    color: str | None = None
    icon: str | None = None
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    serial_number: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    warranty_expiration: date | None = None
    ce_in_scope: bool | None = None
    device_role: str | None = None
    software_firewall_on: bool | None = None
    malware_protection: str | None = None
    os_eol_date: date | None = None
    last_patched_date: date | None = None


class SystemResponse(_SystemFields):
    id: uuid.UUID
    name: str
    slug: str
    source: str = "manual"
    organization_name: str | None = None
    mesh_node_id: str | None = None
    mesh_agent_connected: bool | None = None
    mesh_last_sync_at: datetime | None = None
    mesh_extra: dict[str, Any] | None = None
    wegweiser_device_id: str | None = None
    wegweiser_online: bool | None = None
    wegweiser_last_seen_at: datetime | None = None
    wegweiser_synced_at: datetime | None = None
    wegweiser_extra: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None

    model_config = {"from_attributes": True}


class FleetReadiness(BaseModel):
    in_scope: int
    no_firewall_data: int
    firewall_off: int
    no_malware_protection: int
    os_eol_now: int
    os_eol_soon: int
    patch_stale: int


class ChatMessageBlock(BaseModel):
    """Anthropic-style content block (text / tool_use / tool_result)."""

    type: str
    # text block
    text: str | None = None
    # tool_use block
    id: str | None = None
    name: str | None = None
    input: dict[str, Any] | None = None
    # tool_result block
    tool_use_id: str | None = None
    content: Any | None = None


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    system_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: list[dict[str, Any]]
    usage: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatTurnRequest(BaseModel):
    message: str


class ToolEvent(BaseModel):
    name: str
    input: dict[str, Any]
    output: Any


class ChatTurnResponse(BaseModel):
    assistant_text: str
    tool_events: list[ToolEvent]
    system: SystemResponse
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
