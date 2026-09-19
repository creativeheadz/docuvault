"""Machine authentication for the integration API.

Deliberately NOT `get_current_user`. See `app.models.api_token.ApiToken` for
the reasoning: a token authenticated through this module is not a user, holds
one narrow scope, and is accepted by exactly one router. Nothing that can
decrypt a stored password depends on anything in this file.

The header is `X-API-Key`, not `Authorization: Bearer`, for the same reason:
`get_current_user` reads `Authorization`, and two credential types sharing a
header is how one eventually gets accepted where the other was meant.
"""
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.api_token import (ApiToken, SCOPE_READ_CONTEXT, TOKEN_PREFIX,
                                  generate_token, hash_token)

# Re-exported so callers have one import for "the token machinery"; the
# implementations live on the model, where they can be tested without a web
# framework.
__all__ = ["generate_token", "hash_token", "require_token", "assert_may_read"]

_HEADER = "X-API-Key"


async def require_token(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=_HEADER),
    db: AsyncSession = Depends(get_db),
) -> ApiToken:
    """The authenticated, unrevoked, unexpired token behind this request."""
    if not x_api_key or not x_api_key.startswith(TOKEN_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing or malformed {_HEADER}",
        )

    result = await db.execute(
        select(ApiToken).where(ApiToken.token_hash == hash_token(x_api_key)))
    token = result.scalar_one_or_none()
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Unknown API key")

    now = datetime.now(timezone.utc)
    if token.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="This API key has been revoked")
    if token.expires_at is not None and token.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="This API key has expired")
    if SCOPE_READ_CONTEXT not in (token.scopes or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This API key does not carry read:context")

    # Best effort, and never a reason to fail the request: a usage stamp that
    # can 500 an integration is worse than a usage stamp that is occasionally
    # a few minutes stale.
    try:
        token.last_used_at = now
        client = request.client
        token.last_used_ip = (client.host if client else None) or None
        await db.commit()
    except Exception:
        await db.rollback()

    return token


def assert_may_read(token: ApiToken, organization_id) -> None:
    """404, not 403, when a token asks for an organisation outside its scope.

    Telling an unauthorised caller that an id exists is a disclosure in
    itself, and there is nothing this caller can do with the distinction.
    """
    if not token.allows_organization(organization_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No such organisation")
