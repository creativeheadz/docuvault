import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.configuration import Configuration
from app.models.user import User
from app.services.meshcentral_service import (
    MeshCentralClient,
    _get_mesh_settings,
    public_settings,
    save_settings,
    sync_meshcentral,
    test_meshcentral,
)

router = APIRouter(prefix="/meshcentral", tags=["meshcentral"])


# --- Schemas ---

class MeshSettingsIn(BaseModel):
    url: str
    username: str
    # Blank means "keep the stored one" - editing the URL should not require
    # re-typing a credential the operator may no longer have to hand.
    password: str = ""
    verify_tls: bool = True


class MeshSettingsOut(BaseModel):
    url: str | None = None
    username: str | None = None
    password_set: bool = False
    verify_tls: bool = True
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
    return MeshSettingsOut(**await public_settings(db))


@router.put("/settings", response_model=MeshSettingsOut)
async def save_mesh_settings(
    body: MeshSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return MeshSettingsOut(**await save_settings(
        db, body.url, body.username, body.password, body.verify_tls))


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

    val = await _get_mesh_settings(db)
    if not val:
        raise HTTPException(status_code=400, detail="MeshCentral not configured")

    client = MeshCentralClient(val["url"], val["username"], val["password"],
                               verify_tls=val["verify_tls"])
    return MeshRemoteUrls(
        desktop=client.build_remote_url(config.mesh_node_id, viewmode=11),
        terminal=client.build_remote_url(config.mesh_node_id, viewmode=12),
        files=client.build_remote_url(config.mesh_node_id, viewmode=13),
    )
