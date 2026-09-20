"""Issuing, rotating and revoking refresh tokens.

The rule this implements: a refresh token is good exactly once. Using one
rotates it - the presented token is marked as replaced, a new one is issued
- so a token that turns up after it has already been rotated is a token
that two parties hold. That is theft, and the response is to revoke every
live token the user has rather than to guess which of the two is the
attacker.
"""
from datetime import datetime, timedelta, timezone
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.models.refresh_token import RefreshToken, hash_refresh_token

logger = logging.getLogger(__name__)


class RefreshRejected(Exception):
    """The presented refresh token will not be honoured."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clip(value: str | None, length: int) -> str | None:
    return value[:length] if value else None


async def issue_pair(db: AsyncSession, user_id, *, ip: str | None = None,
                     user_agent: str | None = None) -> tuple[str, str]:
    """A fresh access/refresh pair, with the refresh token recorded."""
    access = create_access_token({"sub": str(user_id)})
    refresh = create_refresh_token({"sub": str(user_id)})
    db.add(RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(refresh),
        expires_at=_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        created_ip=_clip(ip, 64),
        user_agent=_clip(user_agent, 255),
    ))
    await db.flush()
    return access, refresh


async def revoke_all_for_user(db: AsyncSession, user_id) -> int:
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id,
               RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    return result.rowcount or 0


async def revoke(db: AsyncSession, raw_token: str) -> None:
    """Sign one session out. Silent when the token is unknown - logging out
    twice, or with a token from a previous key, is not an error."""
    row = await _lookup(db, raw_token)
    if row is not None and row.revoked_at is None:
        row.revoked_at = _now()
        await db.flush()


async def rotate(db: AsyncSession, raw_token: str, *, ip: str | None = None,
                 user_agent: str | None = None) -> tuple[str, str]:
    """Exchange a refresh token for a new pair, invalidating the old one."""
    row = await _lookup(db, raw_token)
    if row is None:
        raise RefreshRejected("Unknown refresh token")

    if row.replaced_by is not None:
        # Already rotated, and here it is again: two parties hold this
        # token. Which one is legitimate is not knowable from here, so end
        # every session and make them both sign in.
        count = await revoke_all_for_user(db, row.user_id)
        # Committed here rather than left to get_db, which rolls back on the
        # exception this is about to raise. The revocation has to outlive the
        # failed request - otherwise the only visible effect of detecting
        # theft is a 401, and the stolen token keeps working.
        await db.commit()
        logger.warning(
            "Refresh token reuse for user %s - revoked %d live session(s)",
            row.user_id, count)
        raise RefreshRejected("This session has been ended. Please sign in again.")

    if row.revoked_at is not None:
        raise RefreshRejected("This session has been ended. Please sign in again.")
    if row.expires_at <= _now():
        raise RefreshRejected("This session has expired. Please sign in again.")

    access, refresh = await issue_pair(db, row.user_id, ip=ip, user_agent=user_agent)
    row.replaced_by = hash_refresh_token(refresh)
    await db.flush()
    return access, refresh


async def _lookup(db: AsyncSession, raw_token: str) -> RefreshToken | None:
    return (await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(raw_token))
    )).scalar_one_or_none()


async def purge_expired(db: AsyncSession) -> int:
    """Rows for tokens that can no longer be used either way."""
    result = await db.execute(
        RefreshToken.__table__.delete().where(RefreshToken.expires_at <= _now()))
    return result.rowcount or 0
