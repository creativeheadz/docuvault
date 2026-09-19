"""Issue, list and revoke the machine keys that read the integration API.

Ordinary user-authenticated routes: minting a credential that reads client
documentation is a person's decision, made while signed in.

The token is returned ONCE, from the create call, and never again. That is
not a UI nicety - the database holds only a SHA-256, so there is no second
copy to show. A key that cannot be recovered can only be replaced, which is
the behaviour you want from anybody who mislays one.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_auth import generate_token
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.api_token import ApiToken, SCOPE_READ_CONTEXT, VALID_SCOPES
from app.models.user import User

router = APIRouter(prefix="/api-tokens", tags=["api-tokens"])


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    scopes: list[str] = Field(default_factory=lambda: [SCOPE_READ_CONTEXT])
    organization_ids: list[uuid.UUID] = Field(default_factory=list)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class TokenResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    prefix: str
    scopes: list[str]
    organization_ids: list[uuid.UUID]
    expires_at: datetime | None
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class TokenCreated(TokenResponse):
    # Present exactly once, in the response to the create call.
    token: str


@router.get("", response_model=list[TokenResponse])
async def list_tokens(db: AsyncSession = Depends(get_db),
                      _: User = Depends(get_current_user)):
    rows = (await db.execute(select(ApiToken).order_by(
        ApiToken.created_at.desc()))).scalars().all()
    return rows


@router.post("", response_model=TokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(body: TokenCreate, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)):
    bad = [s for s in body.scopes if s not in VALID_SCOPES]
    if bad:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Unknown scope(s): {', '.join(bad)}")
    if not body.scopes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A token with no scope can do nothing")

    raw, prefix, digest = generate_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
                  if body.expires_in_days else None)
    token = ApiToken(
        name=body.name.strip(), description=body.description,
        prefix=prefix, token_hash=digest,
        scopes=list(body.scopes), organization_ids=list(body.organization_ids),
        expires_at=expires_at, created_by=user.id)
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return TokenCreated(token=raw, **{
        k: getattr(token, k) for k in TokenResponse.model_fields})


@router.post("/{token_id}/revoke", response_model=TokenResponse)
async def revoke_token(token_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                       _: User = Depends(get_current_user)):
    """Revoke rather than delete.

    The row is the only record that this key ever existed and when it was
    last used. Deleting it removes the evidence at exactly the moment
    somebody is most likely to want it.
    """
    token = (await db.execute(select(ApiToken).where(
        ApiToken.id == token_id))).scalar_one_or_none()
    if token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No such token")
    if token.revoked_at is None:
        token.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(token)
    return token
