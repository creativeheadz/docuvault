import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --- Graph (what the editor sends and gets back) ---

class _GraphModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, from_attributes=True)


class Viewport(_GraphModel):
    x: float
    y: float
    zoom: float = Field(gt=0, le=10)


class MapNode(_GraphModel):
    id: uuid.UUID
    system_id: uuid.UUID | None = None
    kind: str = Field("other", max_length=30)
    label: str | None = Field(None, max_length=200)
    address: str | None = Field(None, max_length=100)
    x: float = Field(ge=-1e6, le=1e6)
    y: float = Field(ge=-1e6, le=1e6)
    functions: list[str] = Field(default_factory=list, max_length=24)
    notes: str | None = Field(None, max_length=20000)

    @field_validator("functions")
    @classmethod
    def _tidy_functions(cls, v: list[str]) -> list[str]:
        seen: list[str] = []
        for f in v:
            f = f.strip()[:40]
            if f and f not in seen:
                seen.append(f)
        return seen


class MapLink(_GraphModel):
    id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    role: str = Field("peer", max_length=10)
    kind: str = Field("ethernet", max_length=20)
    label: str | None = Field(None, max_length=200)
    source_port: str | None = Field(None, max_length=60)
    target_port: str | None = Field(None, max_length=60)
    speed: str | None = Field(None, max_length=30)
    vlan: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=20000)


class MapZone(_GraphModel):
    id: uuid.UUID
    label: str = Field(..., max_length=200)
    x: float = Field(ge=-1e6, le=1e6)
    y: float = Field(ge=-1e6, le=1e6)
    width: float = Field(gt=0, le=1e5)
    height: float = Field(gt=0, le=1e5)
    tone: str = Field("neutral", max_length=20)
    notes: str | None = Field(None, max_length=20000)


class GraphSave(_GraphModel):
    version: int
    viewport: Viewport | None = None
    nodes: list[MapNode] = Field(default_factory=list, max_length=2000)
    links: list[MapLink] = Field(default_factory=list, max_length=4000)
    zones: list[MapZone] = Field(default_factory=list, max_length=200)


class GraphSaved(BaseModel):
    version: int
    updated_at: datetime


# --- Map metadata ---

class NetworkMapCreate(BaseModel):
    organization_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    location_id: uuid.UUID | None = None


class NetworkMapUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    location_id: uuid.UUID | None = None


class MapPreview(BaseModel):
    """Enough of the drawing to sketch a thumbnail on the list page."""
    nodes: list[tuple[float, float, str]] = []
    links: list[tuple[int, int]] = []
    zones: list[tuple[float, float, float, float]] = []


class NetworkMapSummary(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str | None = None
    location_id: uuid.UUID | None = None
    location_name: str | None = None
    name: str
    description: str | None = None
    node_count: int = 0
    link_count: int = 0
    record_count: int = 0
    created_at: datetime
    updated_at: datetime
    preview: MapPreview = Field(default_factory=MapPreview)


# --- The records a map draws on ---

class RecordFirewallRule(BaseModel):
    id: uuid.UUID
    name: str
    direction: str
    protocol: str
    external_port: str
    internal_port: str | None = None
    status: str

    model_config = {"from_attributes": True}


class MapRecord(BaseModel):
    """A system as the map needs it: identity, addressing,
    live agent state and the compliance facts worth flagging on a node."""
    id: uuid.UUID
    name: str
    category: str | None = None
    hostname: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    operating_system: str | None = None
    os_version: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    device_role: str | None = None
    mesh_node_id: str | None = None
    mesh_agent_connected: bool | None = None
    mesh_last_sync_at: datetime | None = None
    wegweiser_device_id: str | None = None
    wegweiser_online: bool | None = None
    wegweiser_last_seen_at: datetime | None = None
    wegweiser_extra: dict | None = None
    ce_in_scope: bool = True
    software_firewall_on: bool | None = None
    malware_protection: str | None = None
    os_eol_date: date | None = None
    last_patched_date: date | None = None
    archived: bool = False
    firewall_rules: list[RecordFirewallRule] = []


class NetworkMapDetail(NetworkMapSummary):
    version: int
    viewport: Viewport | None = None
    nodes: list[MapNode] = []
    links: list[MapLink] = []
    zones: list[MapZone] = []
    records: list[MapRecord] = []


class Placement(BaseModel):
    system_id: uuid.UUID
    map_id: uuid.UUID
    map_name: str
    node_id: uuid.UUID
