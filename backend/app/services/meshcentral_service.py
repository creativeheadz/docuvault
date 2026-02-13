import base64
import json
import logging
import ssl
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse

import websockets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.configuration import Configuration
from app.models.app_settings import AppSettings

logger = logging.getLogger(__name__)


class MeshCentralClient:
    """WebSocket client for MeshCentral control channel."""

    def __init__(self, url: str, username: str, password: str):
        parsed = urlparse(url)
        self.base_url = f"{parsed.scheme}://{parsed.hostname}"
        if parsed.port:
            self.base_url += f":{parsed.port}"
        ws_scheme = "wss" if parsed.scheme == "https" else "ws"
        host = parsed.hostname
        port = f":{parsed.port}" if parsed.port else ""
        self.ws_url = f"{ws_scheme}://{host}{port}/control.ashx"
        # x-meshauth expects each part individually base64-encoded:
        # base64(user),base64(pass),base64(token_or_empty)
        self.auth_header = (
            base64.b64encode(username.encode()).decode() + ","
            + base64.b64encode(password.encode()).decode() + ","
        )
        self._ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self._ssl_context.check_hostname = False
        self._ssl_context.verify_mode = ssl.CERT_NONE

    async def _send_command(self, command: dict) -> dict:
        """Open a WS connection, send a command, return the response."""
        extra = {"additional_headers": {"x-meshauth": self.auth_header}}
        if self.ws_url.startswith("wss"):
            extra["ssl"] = self._ssl_context
        async with websockets.connect(self.ws_url, **extra) as ws:
            # MeshCentral sends a server info frame first; check for auth rejection
            first_raw = await ws.recv()
            try:
                first = json.loads(first_raw)
                if first.get("action") == "close":
                    raise ConnectionError(
                        f"MeshCentral rejected connection: {first.get('msg', 'unknown')}"
                    )
            except (json.JSONDecodeError, TypeError):
                pass  # binary or non-JSON server info frame, that's fine
            await ws.send(json.dumps(command))
            # Read responses until we get the one matching our action
            target_action = command.get("action")
            for _ in range(20):
                raw = await ws.recv()
                data = json.loads(raw)
                if data.get("action") == target_action:
                    return data
        return {}

    async def get_meshes(self) -> list[dict]:
        """Fetch all device groups (meshes)."""
        resp = await self._send_command({"action": "meshes"})
        raw = resp.get("meshes") or []
        if isinstance(raw, list):
            return raw
        # dict keyed by domain
        meshes = []
        for domain_meshes in raw.values():
            if isinstance(domain_meshes, list):
                meshes.extend(domain_meshes)
            elif isinstance(domain_meshes, dict):
                meshes.extend(domain_meshes.values())
        return meshes

    async def get_nodes(self) -> list[dict]:
        """Fetch all devices (nodes). Injects 'meshid' into each node dict."""
        resp = await self._send_command({"action": "nodes"})
        nodes = []
        raw = resp.get("nodes") or {}
        if isinstance(raw, dict):
            # Nodes are grouped by mesh ID as dict keys
            for mesh_id, node_list in raw.items():
                if isinstance(node_list, list):
                    for node in node_list:
                        node["meshid"] = mesh_id
                        nodes.append(node)
        elif isinstance(raw, list):
            nodes = raw
        return nodes

    def build_remote_url(self, node_id: str, viewmode: int = 11) -> str:
        """Build a remote session URL.

        viewmode: 11=Desktop, 12=Terminal, 15=Files
        """
        params = urlencode({"viewmode": viewmode, "gotonode": node_id})
        return f"{self.base_url}/?{params}"


async def _get_mesh_settings(db: AsyncSession) -> dict | None:
    """Load MeshCentral connection settings from AppSettings."""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "meshcentral")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return None
    return row.value


async def test_meshcentral(db: AsyncSession) -> dict:
    """Test connection and return mesh/node counts."""
    settings = await _get_mesh_settings(db)
    if not settings:
        raise ValueError("MeshCentral is not configured")
    client = MeshCentralClient(
        url=settings["url"],
        username=settings["username"],
        password=settings["password"],
    )
    meshes = await client.get_meshes()
    nodes = await client.get_nodes()
    return {
        "success": True,
        "mesh_count": len(meshes),
        "node_count": len(nodes),
    }


async def sync_meshcentral(db: AsyncSession) -> dict:
    """Full sync: upsert organizations from meshes and configurations from nodes."""
    settings = await _get_mesh_settings(db)
    if not settings:
        raise ValueError("MeshCentral is not configured")

    client = MeshCentralClient(
        url=settings["url"],
        username=settings["username"],
        password=settings["password"],
    )

    now = datetime.now(timezone.utc)
    stats = {
        "orgs_created": 0, "orgs_updated": 0,
        "devices_created": 0, "devices_updated": 0,
        "online": 0, "offline": 0, "errors": [],
    }

    # --- Sync meshes -> Organizations ---
    meshes = await client.get_meshes()
    mesh_id_to_org: dict[str, Organization] = {}

    for mesh in meshes:
        mesh_id = mesh.get("_id", "")
        mesh_name = mesh.get("name", "Unnamed Mesh")
        try:
            result = await db.execute(
                select(Organization).where(Organization.mesh_id == mesh_id)
            )
            org = result.scalar_one_or_none()
            if org:
                org.name = mesh_name
                stats["orgs_updated"] += 1
            else:
                org = Organization(name=mesh_name, mesh_id=mesh_id)
                db.add(org)
                await db.flush()
                stats["orgs_created"] += 1
            mesh_id_to_org[mesh_id] = org
        except Exception as e:
            stats["errors"].append(f"Mesh {mesh_id}: {e}")

    # --- Sync nodes -> Configurations ---
    nodes = await client.get_nodes()

    for node in nodes:
        node_id = node.get("_id", "")
        mesh_id = node.get("meshid", "")
        try:
            org = mesh_id_to_org.get(mesh_id)
            if not org:
                result = await db.execute(
                    select(Organization).where(Organization.mesh_id == mesh_id)
                )
                org = result.scalar_one_or_none()
            if not org:
                stats["errors"].append(f"Node {node_id}: no org for mesh {mesh_id}")
                continue

            connected = bool(node.get("conn"))
            if connected:
                stats["online"] += 1
            else:
                stats["offline"] += 1

            # Extract IP from node.inaddr or host field
            ip_addr = None
            if node.get("inaddr"):
                ip_addr = node["inaddr"] if isinstance(node["inaddr"], str) else None
            if not ip_addr and node.get("host"):
                ip_addr = node["host"]

            extra = {}
            for key in ("agent", "tags", "users", "icon", "pwr", "agentvers"):
                if key in node:
                    extra[key] = node[key]

            result = await db.execute(
                select(Configuration).where(Configuration.mesh_node_id == node_id)
            )
            config = result.scalar_one_or_none()

            if config:
                config.name = node.get("name", config.name)
                config.hostname = node.get("rname") or node.get("name")
                config.operating_system = node.get("osdesc")
                config.ip_address = ip_addr
                config.mesh_agent_connected = connected
                config.mesh_last_sync_at = now
                config.mesh_extra = extra
                config.organization_id = org.id
                stats["devices_updated"] += 1
            else:
                config = Configuration(
                    organization_id=org.id,
                    name=node.get("name", "Unknown"),
                    hostname=node.get("rname") or node.get("name"),
                    operating_system=node.get("osdesc"),
                    ip_address=ip_addr,
                    mesh_node_id=node_id,
                    mesh_agent_connected=connected,
                    mesh_last_sync_at=now,
                    mesh_extra=extra,
                )
                db.add(config)
                stats["devices_created"] += 1
        except Exception as e:
            stats["errors"].append(f"Node {node_id}: {e}")

    await db.flush()
    return stats
