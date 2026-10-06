"""Machine authentication for the API surfaces that answer to another system.

Deliberately NOT `get_current_user`. See `app.models.api_token.ApiToken` for
the reasoning: a token authenticated through this module is not a user, holds
narrow named scopes, and is accepted only by the routers that ask for one of
them. Nothing that can decrypt a stored password depends on anything in this
file.

The header is `X-API-Key`, not `Authorization: Bearer`, for the same reason:
`get_current_user` reads `Authorization`, and two credential types sharing a
header is how one eventually gets accepted where the other was meant.

Two scopes exist. `read:context` is what the integration router checks;
`write:tasks` is what the tasks router checks. A router asks for its scope by
name through `require_scope`, so a key minted for one cannot be pointed at
the other, and the requirement is visible in the route's own signature rather
than in a table somewhere else.
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
__all__ = ["generate_token", "hash_token", "authenticate_token", "assert_scope",
           "require_scope", "require_token", "assert_may_read"]

_HEADER = "X-API-Key"


async def authenticate_token(request: Request, x_api_key: str | None,
                             db: AsyncSession) -> ApiToken:
    """The live token behind this request, or 401. Asks nothing about scope.

    A plain coroutine rather than a dependency so that a router which accepts
    two kinds of credential (tasks: a person or a key) can call it after it
    has decided which kind it was handed.
    """
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
    problem = token.rejection(now)
    if problem:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail=problem)

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


def assert_scope(token: ApiToken, scope: str) -> None:
    """403 when a live key was minted for something else."""
    if not token.has_scope(scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"This API key does not carry {scope}")


def require_scope(scope: str):
    """A dependency yielding a live token that carries `scope`.

    One per router, built where the router is declared, so the scope a route
    demands is written next to the route.
    """
    async def dependency(
        request: Request,
        x_api_key: str | None = Header(default=None, alias=_HEADER),
        db: AsyncSession = Depends(get_db),
    ) -> ApiToken:
        token = await authenticate_token(request, x_api_key, db)
        assert_scope(token, scope)
        return token

    dependency.__name__ = "require_" + scope.replace(":", "_")
    dependency.__doc__ = f"The authenticated, unrevoked, unexpired token carrying {scope}."
    return dependency


# What the integration router has depended on since the beginning, kept under
# its original name so that router reads exactly as it did.
require_token = require_scope(SCOPE_READ_CONTEXT)


def assert_may_read(token: ApiToken, organization_id) -> None:
    """404, not 403, when a token asks for an organisation outside its scope.

    Telling an unauthorised caller that an id exists is a disclosure in
    itself, and there is nothing this caller can do with the distinction.
    """
    if not token.allows_organization(organization_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No such organisation")
