import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.network_map import (
    GraphSave, GraphSaved, NetworkMapCreate, NetworkMapDetail,
    NetworkMapSummary, NetworkMapUpdate, Placement,
)
from app.services import network_map_service as svc
from app.services.network_map_service import GraphError, VersionConflict

router = APIRouter(prefix="/network-maps", tags=["network-maps"])


@router.get("", response_model=list[NetworkMapSummary])
async def list_network_maps(
    organization_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return [svc.summarize(m) for m in await svc.list_maps(db, organization_id)]


@router.get("/placements", response_model=list[Placement])
async def list_placements(
    configuration_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await svc.placements(db, configuration_id)


@router.post("", response_model=NetworkMapDetail, status_code=status.HTTP_201_CREATED)
async def create_network_map(
    body: NetworkMapCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        m = await svc.create_map(db, body)
    except GraphError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await svc.detail(db, m)


@router.get("/{map_id}", response_model=NetworkMapDetail)
async def get_network_map(
    map_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    m = await svc.get_map(db, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Network map not found")
    return await svc.detail(db, m)


@router.put("/{map_id}", response_model=NetworkMapSummary)
async def update_network_map(
    map_id: uuid.UUID,
    body: NetworkMapUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    m = await svc.get_map(db, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Network map not found")
    try:
        m = await svc.update_map(db, m, body)
    except GraphError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return svc.summarize(m)


@router.put("/{map_id}/graph", response_model=GraphSaved)
async def save_network_map_graph(
    map_id: uuid.UUID,
    body: GraphSave,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        m = await svc.save_graph(db, map_id, body)
    except VersionConflict as e:
        raise HTTPException(
            status_code=409,
            detail={"message": "This map was changed somewhere else since you opened it", "version": e.current},
        )
    except GraphError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError:
        # A client-made id that collides with a row of another map.
        raise HTTPException(status_code=400, detail="The drawing refers to an element that belongs to another map")
    if m is None:
        raise HTTPException(status_code=404, detail="Network map not found")
    return GraphSaved(version=m.version, updated_at=m.updated_at)


@router.delete("/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_network_map(
    map_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    m = await svc.get_map(db, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Network map not found")
    await db.delete(m)
