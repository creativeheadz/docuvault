import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_mfa_token, decode_token
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, TokenResponse, RefreshRequest, UserResponse, MfaVerifyRequest
from app.services.auth_service import authenticate
from app.services.mfa_service import (TotpSecretUnreadable, decrypt_secret,
                                      verify_totp_code)
from app.services.refresh_token_service import (RefreshRejected, issue_pair,
                                                revoke, rotate)

router = APIRouter(prefix="/auth", tags=["auth"])

# Cookies are set here rather than in each route so that the flags cannot
# drift apart. `secure` follows the deployment: a production instance is
# reachable over HTTPS and the session must not be sent in clear, while a
# development instance on http://localhost would simply never receive the
# cookie back if it were set unconditionally.
_SECURE_COOKIES = settings.ENVIRONMENT.strip().lower() == "production"


def _set_session_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, samesite="lax",
                        secure=_SECURE_COOKIES,
                        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    response.set_cookie("refresh_token", refresh, httponly=True, samesite="lax",
                        secure=_SECURE_COOKIES,
                        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)


def _client(request: Request) -> tuple[str | None, str | None]:
    return (request.client.host if request.client else None,
            request.headers.get("user-agent"))




@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, response: Response,
                db: AsyncSession = Depends(get_db)):
    user = await authenticate(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.totp_enabled:
        mfa_token = create_mfa_token({"sub": str(user.id)})
        return LoginResponse(mfa_required=True, mfa_token=mfa_token)

    ip, agent = _client(request)
    access_token, refresh_token = await issue_pair(db, user.id, ip=ip, user_agent=agent)
    _set_session_cookies(response, access_token, refresh_token)

    return LoginResponse(
        mfa_required=False,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/mfa-verify", response_model=TokenResponse)
async def mfa_verify(body: MfaVerifyRequest, request: Request, response: Response,
                     db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.mfa_token)
    if not payload or payload.get("type") != "mfa_pending":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or MFA not enabled")

    try:
        secret = decrypt_secret(user.totp_secret)
    except TotpSecretUnreadable as exc:
        # 503, not 500: the credential is fine, the server cannot read it,
        # and retrying the same code will not help.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)) from exc
    if not verify_totp_code(secret, body.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    ip, agent = _client(request)
    access_token, refresh_token = await issue_pair(db, user.id, ip=ip, user_agent=agent)
    _set_session_cookies(response, access_token, refresh_token)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request, response: Response,
                  db: AsyncSession = Depends(get_db)):
    # The signature is checked first so that a token which was never ours
    # does not cost a database lookup.
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    ip, agent = _client(request)
    try:
        access_token, refresh_token = await rotate(
            db, body.refresh_token, ip=ip, user_agent=agent)
    except RefreshRejected as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail=str(exc)) from exc

    _set_session_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout")
async def logout(request: Request, response: Response,
                 body: RefreshRequest | None = None,
                 db: AsyncSession = Depends(get_db)):
    """End this session server-side, not just in the browser.

    The token is taken from the cookie or the body, because the SPA holds it
    in either depending on how it signed in. Clearing a cookie without
    revoking the token was the whole bug: the credential stayed valid.
    """
    token = (body.refresh_token if body else None) or request.cookies.get("refresh_token")
    if token:
        await revoke(db, token)
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
