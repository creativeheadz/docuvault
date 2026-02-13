import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.encryption import encrypt, decrypt
from app.models.password import Password
from app.models.password_category import PasswordCategory
from app.models.password_audit import PasswordAccessLog
from app.models.user import User
from app.schemas.password import (
    PasswordCreate, PasswordUpdate, PasswordResponse, PasswordRevealResponse,
    PasswordAccessLogResponse, PasswordCategoryCreate, PasswordCategoryResponse,
)
from app.services.password_service import log_access

router = APIRouter(prefix="/passwords", tags=["passwords"])


# --- Categories ---

@router.get("/categories", response_model=list[PasswordCategoryResponse])
async def list_categories(
    organization_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(PasswordCategory)
    if organization_id:
        query = query.where(PasswordCategory.organization_id == organization_id)
    return (await db.execute(query.order_by(PasswordCategory.name))).scalars().all()


@router.post("/categories", response_model=PasswordCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(body: PasswordCategoryCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    cat = PasswordCategory(**body.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(cat_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PasswordCategory).where(PasswordCategory.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)


# --- Passwords ---

@router.get("", response_model=list[PasswordResponse])
async def list_passwords(
    organization_id: uuid.UUID | None = Query(None),
    category_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=255),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Password).where(Password.archived_at.is_(None))
    if organization_id:
        query = query.where(Password.organization_id == organization_id)
    if category_id:
        query = query.where(Password.category_id == category_id)
    if search:
        query = query.where(Password.name.ilike(f"%{search}%"))
    items = (await db.execute(query.order_by(Password.name).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=PasswordResponse, status_code=status.HTTP_201_CREATED)
async def create_password(body: PasswordCreate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    data = body.model_dump(exclude={"password_value"})
    pw = Password(**data)
    if body.password_value:
        pw.password_encrypted = encrypt(body.password_value)
    db.add(pw)
    await db.flush()
    await db.refresh(pw)
    await log_access(db, pw.id, user.id, "create", request.client.host if request.client else None)
    return pw


@router.get("/{item_id}", response_model=PasswordResponse)
async def get_password(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Password).where(Password.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Password not found")
    return item


@router.put("/{item_id}", response_model=PasswordResponse)
async def update_password(item_id: uuid.UUID, body: PasswordUpdate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Password).where(Password.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Password not found")
    for field, value in body.model_dump(exclude_unset=True, exclude={"password_value"}).items():
        setattr(item, field, value)
    if body.password_value is not None:
        item.password_encrypted = encrypt(body.password_value)
    await db.flush()
    await db.refresh(item)
    await log_access(db, item.id, user.id, "update", request.client.host if request.client else None)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_password(item_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Password).where(Password.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Password not found")
    await log_access(db, item.id, user.id, "delete", request.client.host if request.client else None)
    await db.delete(item)


@router.post("/{item_id}/reveal", response_model=PasswordRevealResponse)
async def reveal_password(item_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Password).where(Password.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Password not found")
    if not item.password_encrypted:
        return PasswordRevealResponse(password="")
    await log_access(db, item.id, user.id, "reveal", request.client.host if request.client else None)
    decrypted = decrypt(item.password_encrypted)
    return PasswordRevealResponse(password=decrypted)


@router.get("/{item_id}/audit", response_model=list[PasswordAccessLogResponse])
async def get_audit_log(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(PasswordAccessLog)
        .where(PasswordAccessLog.password_id == item_id)
        .order_by(PasswordAccessLog.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()
