import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.app_settings import AppSettings
from app.models.configuration import Configuration
from app.models.user import User
from app.services.meshcentral_service import (
    MeshCentralClient,
    sync_meshcentral,
    test_meshcentral,
)

router = APIRouter(prefix="/meshcentral", tags=["meshcentral"])


# --- Schemas ---

class MeshSettingsIn(BaseModel):
    url: str
    username: str
    password: str


class MeshSettingsOut(BaseModel):
    url: str | None = None
    username: str | None = None
    password_set: bool = False
    configured: bool = False


class MeshTestResult(BaseModel):
    success: bool
    mesh_count: int = 0
    node_count: int = 0
    error: str | None = None


class MeshSyncResult(BaseModel):
    orgs_created: int = 0
    orgs_updated: int = 0
    devices_created: int = 0
    devices_updated: int = 0
    online: int = 0
    offline: int = 0
    errors: list[str] = []


class MeshRemoteUrls(BaseModel):
    desktop: str | None = None
    terminal: str | None = None
    files: str | None = None


# --- Endpoints ---

@router.get("/settings", response_model=MeshSettingsOut)
async def get_mesh_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "meshcentral")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return MeshSettingsOut()
    val = row.value
    return MeshSettingsOut(
        url=val.get("url"),
        username=val.get("username"),
        password_set=bool(val.get("password")),
        configured=True,
    )


@router.put("/settings", response_model=MeshSettingsOut)
async def save_mesh_settings(
    body: MeshSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "meshcentral")
    )
    row = result.scalar_one_or_none()
    value = {"url": body.url, "username": body.username, "password": body.password}
    if row:
        row.value = value
    else:
        row = AppSettings(key="meshcentral", value=value)
        db.add(row)
    await db.flush()
    return MeshSettingsOut(
        url=body.url,
        username=body.username,
        password_set=True,
        configured=True,
    )


@router.post("/test", response_model=MeshTestResult)
async def test_connection(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        result = await test_meshcentral(db)
        return MeshTestResult(**result)
    except Exception as e:
        return MeshTestResult(success=False, error=str(e))


@router.post("/sync", response_model=MeshSyncResult)
async def trigger_sync(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        stats = await sync_meshcentral(db)
        return MeshSyncResult(**stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/remote-url/{config_id}", response_model=MeshRemoteUrls)
async def get_remote_urls(
    config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Configuration).where(Configuration.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    if not config.mesh_node_id:
        raise HTTPException(status_code=400, detail="Not a MeshCentral device")

    settings_result = await db.execute(
        select(AppSettings).where(AppSettings.key == "meshcentral")
    )
    settings_row = settings_result.scalar_one_or_none()
    if not settings_row or not settings_row.value:
        raise HTTPException(status_code=400, detail="MeshCentral not configured")

    val = settings_row.value
    client = MeshCentralClient(val["url"], val["username"], val["password"])
    return MeshRemoteUrls(
        desktop=client.build_remote_url(config.mesh_node_id, viewmode=11),
        terminal=client.build_remote_url(config.mesh_node_id, viewmode=12),
        files=client.build_remote_url(config.mesh_node_id, viewmode=15),
    )
