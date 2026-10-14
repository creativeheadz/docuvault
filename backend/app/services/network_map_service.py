"""Network maps: a hand-drawn topology laid over an organisation's records.

A map is a graph of nodes (devices, each optionally backed by a
``Configuration``), links between them, and zones (labelled areas drawn
behind the devices). The editor owns the drawing and saves the whole graph
at once; this module checks it holds together and writes the difference.

The rules a saved graph must keep, all enforced in :func:`validate_graph`:

* every kind, role and tone is one the frontend knows how to draw;
* a node may stand for a record of the map's own organisation only, and
  each record appears on a map at most once;
* links join two different nodes that are both on the map;
* a node has at most one uplink (its gateway), and following uplinks never
  comes back round. The uplinks are the tree that auto-layout arranges.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.configuration import Configuration
from app.models.firewall_rule import FirewallRule
from app.models.location import Location
from app.models.network_map import (
    LINK_KINDS, LINK_ROLES, NODE_KINDS, ZONE_TONES,
    NetworkMap, NetworkMapLink, NetworkMapNode, NetworkMapZone,
)
from app.models.organization import Organization
from app.schemas.network_map import (
    GraphSave, MapLink, MapNode, MapPreview, MapRecord, MapZone,
    NetworkMapCreate, NetworkMapDetail, NetworkMapSummary, NetworkMapUpdate,
    Placement, RecordFirewallRule, Viewport,
)


class GraphError(ValueError):
    """The graph, or the map around it, breaks one of the rules above."""


class VersionConflict(Exception):
    """The map was saved by someone else since this editor loaded it."""

    def __init__(self, current: int):
        super().__init__(f"Map is at version {current}")
        self.current = current


# --- Validation (pure) ---

def validate_graph(
    nodes: Iterable[MapNode],
    links: Iterable[MapLink],
    zones: Iterable[MapZone],
    allowed_configuration_ids: set[uuid.UUID],
) -> None:
    nodes, links, zones = list(nodes), list(links), list(zones)

    node_ids: set[uuid.UUID] = set()
    placed: set[uuid.UUID] = set()
    for n in nodes:
        if n.id in node_ids:
            raise GraphError("The same device appears twice")
        node_ids.add(n.id)
        if n.kind not in NODE_KINDS:
            raise GraphError(f"Unknown device kind '{n.kind}'")
        if n.configuration_id is not None:
            if n.configuration_id not in allowed_configuration_ids:
                raise GraphError("A device points at a record that is not in this organisation")
            if n.configuration_id in placed:
                raise GraphError("A record can only be placed once on a map")
            placed.add(n.configuration_id)

    link_ids: set[uuid.UUID] = set()
    gateway: dict[uuid.UUID, uuid.UUID] = {}
    for link in links:
        if link.id in link_ids:
            raise GraphError("The same connection appears twice")
        link_ids.add(link.id)
        if link.role not in LINK_ROLES:
            raise GraphError(f"Unknown connection role '{link.role}'")
        if link.kind not in LINK_KINDS:
            raise GraphError(f"Unknown connection kind '{link.kind}'")
        if link.source_node_id not in node_ids or link.target_node_id not in node_ids:
            raise GraphError("A connection ends at a device that is not on the map")
        if link.source_node_id == link.target_node_id:
            raise GraphError("A connection cannot join a device to itself")
        if link.role == "uplink":
            if link.source_node_id in gateway:
                raise GraphError("A device can only have one gateway")
            gateway[link.source_node_id] = link.target_node_id

    # Walk each chain of gateways once; meeting a node already on the
    # current walk means the chain loops.
    VISITING, DONE = 1, 2
    state: dict[uuid.UUID, int] = {}
    for start in gateway:
        path: list[uuid.UUID] = []
        cur: uuid.UUID | None = start
        while cur is not None and cur not in state:
            state[cur] = VISITING
            path.append(cur)
            cur = gateway.get(cur)
        if cur is not None and state[cur] == VISITING:
            raise GraphError("Gateways go round in a circle: a device ends up upstream of itself")
        for p in path:
            state[p] = DONE

    zone_ids: set[uuid.UUID] = set()
    for z in zones:
        if z.id in zone_ids:
            raise GraphError("The same zone appears twice")
        zone_ids.add(z.id)
        if z.tone not in ZONE_TONES:
            raise GraphError(f"Unknown zone tone '{z.tone}'")


# --- Reads ---

async def get_map(db: AsyncSession, map_id: uuid.UUID, *, fresh: bool = False) -> NetworkMap | None:
    """``fresh`` reloads a map this session already holds, so server-set
    columns and the child collections are readable after a write."""
    q = select(NetworkMap).where(NetworkMap.id == map_id)
    if fresh:
        q = q.execution_options(populate_existing=True)
    return (await db.execute(q)).scalar_one_or_none()


async def list_maps(db: AsyncSession, organization_id: uuid.UUID | None = None) -> list[NetworkMap]:
    q = select(NetworkMap)
    if organization_id is not None:
        q = q.where(NetworkMap.organization_id == organization_id)
    q = q.order_by(NetworkMap.updated_at.desc())
    return list((await db.execute(q)).scalars().all())


def summarize(m: NetworkMap) -> NetworkMapSummary:
    index = {n.id: i for i, n in enumerate(m.nodes)}
    return NetworkMapSummary(
        id=m.id,
        organization_id=m.organization_id,
        organization_name=m.organization.name if m.organization else None,
        location_id=m.location_id,
        location_name=m.location.name if m.location else None,
        name=m.name,
        description=m.description,
        node_count=len(m.nodes),
        link_count=len(m.links),
        record_count=sum(1 for n in m.nodes if n.configuration_id is not None),
        created_at=m.created_at,
        updated_at=m.updated_at,
        preview=MapPreview(
            nodes=[(n.x, n.y, n.kind) for n in m.nodes],
            links=[
                (index[link.source_node_id], index[link.target_node_id])
                for link in m.links
                if link.source_node_id in index and link.target_node_id in index
            ],
            zones=[(z.x, z.y, z.width, z.height) for z in m.zones],
        ),
    )


async def records_for(db: AsyncSession, m: NetworkMap) -> list[MapRecord]:
    """Every live record of the map's organisation, plus any archived one a
    node still points at, so that node keeps its name and details."""
    placed = [n.configuration_id for n in m.nodes if n.configuration_id is not None]
    q = select(Configuration).where(Configuration.organization_id == m.organization_id)
    if placed:
        q = q.where(or_(Configuration.archived_at.is_(None), Configuration.id.in_(placed)))
    else:
        q = q.where(Configuration.archived_at.is_(None))
    configs = list((await db.execute(q.order_by(Configuration.name))).scalars().all())

    rules: dict[uuid.UUID, list[RecordFirewallRule]] = {}
    if configs:
        rows = await db.execute(
            select(
                FirewallRule.id, FirewallRule.configuration_id, FirewallRule.name,
                FirewallRule.direction, FirewallRule.protocol, FirewallRule.external_port,
                FirewallRule.internal_port, FirewallRule.status,
            )
            .where(
                FirewallRule.configuration_id.in_([c.id for c in configs]),
                FirewallRule.archived_at.is_(None),
                FirewallRule.status != "removed",
            )
            .order_by(FirewallRule.name)
        )
        for r in rows:
            rules.setdefault(r.configuration_id, []).append(RecordFirewallRule(
                id=r.id, name=r.name, direction=r.direction, protocol=r.protocol,
                external_port=r.external_port, internal_port=r.internal_port, status=r.status,
            ))

    return [
        MapRecord(
            id=c.id,
            name=c.name,
            configuration_type=c.configuration_type,
            hostname=c.hostname,
            ip_address=c.ip_address,
            mac_address=c.mac_address,
            operating_system=c.operating_system,
            os_version=c.os_version,
            manufacturer=c.manufacturer,
            model=c.model,
            serial_number=c.serial_number,
            device_role=c.device_role,
            mesh_node_id=c.mesh_node_id,
            mesh_agent_connected=c.mesh_agent_connected,
            mesh_last_sync_at=c.mesh_last_sync_at,
            ce_in_scope=c.ce_in_scope,
            software_firewall_on=c.software_firewall_on,
            malware_protection=c.malware_protection,
            os_eol_date=c.os_eol_date,
            last_patched_date=c.last_patched_date,
            archived=c.archived_at is not None,
            firewall_rules=rules.get(c.id, []),
        )
        for c in configs
    ]


async def detail(db: AsyncSession, m: NetworkMap) -> NetworkMapDetail:
    return NetworkMapDetail(
        **summarize(m).model_dump(),
        version=m.version,
        viewport=Viewport(**m.viewport) if m.viewport else None,
        nodes=[MapNode.model_validate(n) for n in m.nodes],
        links=[MapLink.model_validate(link) for link in m.links],
        zones=[MapZone.model_validate(z) for z in m.zones],
        records=await records_for(db, m),
    )


async def placements(db: AsyncSession, configuration_id: uuid.UUID | None = None) -> list[Placement]:
    """Where each record sits on a map, for linking back from the records."""
    q = (
        select(NetworkMapNode.configuration_id, NetworkMap.id, NetworkMap.name, NetworkMapNode.id)
        .join(NetworkMap, NetworkMap.id == NetworkMapNode.map_id)
        .where(NetworkMapNode.configuration_id.isnot(None))
        .order_by(NetworkMap.name)
    )
    if configuration_id is not None:
        q = q.where(NetworkMapNode.configuration_id == configuration_id)
    return [
        Placement(configuration_id=cid, map_id=mid, map_name=mname, node_id=nid)
        for cid, mid, mname, nid in (await db.execute(q)).all()
    ]


# --- Writes ---

async def _check_location(db: AsyncSession, location_id: uuid.UUID | None, organization_id: uuid.UUID) -> None:
    if location_id is None:
        return
    loc = (await db.execute(select(Location).where(Location.id == location_id))).scalar_one_or_none()
    if loc is None or loc.organization_id != organization_id:
        raise GraphError("That location does not belong to this organisation")


async def create_map(db: AsyncSession, body: NetworkMapCreate) -> NetworkMap:
    org = (await db.execute(select(Organization).where(Organization.id == body.organization_id))).scalar_one_or_none()
    if org is None:
        raise GraphError("Organisation not found")
    await _check_location(db, body.location_id, body.organization_id)
    m = NetworkMap(
        organization_id=body.organization_id,
        location_id=body.location_id,
        name=body.name.strip(),
        description=body.description,
        version=1,
    )
    db.add(m)
    await db.flush()
    return await get_map(db, m.id, fresh=True)  # type: ignore[return-value]


async def update_map(db: AsyncSession, m: NetworkMap, body: NetworkMapUpdate) -> NetworkMap:
    updates = body.model_dump(exclude_unset=True)
    if "location_id" in updates:
        await _check_location(db, updates["location_id"], m.organization_id)
    if updates.get("name") is not None:
        updates["name"] = updates["name"].strip()
    elif "name" in updates:
        del updates["name"]
    for field, value in updates.items():
        setattr(m, field, value)
    m.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return await get_map(db, m.id, fresh=True)  # type: ignore[return-value]


async def save_graph(db: AsyncSession, map_id: uuid.UUID, body: GraphSave) -> NetworkMap | None:
    """Replace the map's drawing with ``body``, keeping row identity where
    an element survives. Raises :class:`VersionConflict` if the editor is
    behind, :class:`GraphError` if the graph breaks a rule."""
    m = (
        await db.execute(select(NetworkMap).where(NetworkMap.id == map_id).with_for_update())
    ).scalar_one_or_none()
    if m is None:
        return None
    if body.version != m.version:
        raise VersionConflict(m.version)

    allowed = set(
        (await db.execute(
            select(Configuration.id).where(Configuration.organization_id == m.organization_id)
        )).scalars().all()
    )
    validate_graph(body.nodes, body.links, body.zones, allowed)

    # Removals first, connections before the devices they hang off.
    keep_links = {link.id for link in body.links}
    keep_nodes = {n.id for n in body.nodes}
    keep_zones = {z.id for z in body.zones}
    for link in [x for x in m.links if x.id not in keep_links]:
        m.links.remove(link)
    for z in [x for x in m.zones if x.id not in keep_zones]:
        m.zones.remove(z)
    await db.flush()
    for n in [x for x in m.nodes if x.id not in keep_nodes]:
        m.nodes.remove(n)
    await db.flush()

    _upsert(m.nodes, body.nodes, NetworkMapNode)
    _upsert(m.zones, body.zones, NetworkMapZone)
    await db.flush()
    _upsert(m.links, body.links, NetworkMapLink)

    if body.viewport is not None:
        m.viewport = body.viewport.model_dump()
    m.version += 1
    m.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return m


def _upsert(rows: list, items: list, model: type) -> None:
    existing = {r.id: r for r in rows}
    for item in items:
        data = item.model_dump(exclude={"id"})
        row = existing.get(item.id)
        if row is None:
            rows.append(model(id=item.id, **data))
        else:
            for field, value in data.items():
                if getattr(row, field) != value:
                    setattr(row, field, value)
