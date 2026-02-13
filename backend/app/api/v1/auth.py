import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, create_refresh_token, create_mfa_token, decode_token
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, TokenResponse, RefreshRequest, UserResponse, MfaVerifyRequest
from app.services.auth_service import authenticate
from app.services.mfa_service import decrypt_secret, verify_totp_code

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await authenticate(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.totp_enabled:
        mfa_token = create_mfa_token({"sub": str(user.id)})
        return LoginResponse(mfa_required=True, mfa_token=mfa_token)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie("access_token", access_token, httponly=True, samesite="lax", max_age=900)
    response.set_cookie("refresh_token", refresh_token, httponly=True, samesite="lax", max_age=604800)

    return LoginResponse(
        mfa_required=False,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/mfa-verify", response_model=TokenResponse)
async def mfa_verify(body: MfaVerifyRequest, response: Response, db: AsyncSession = Depends(get_db)):
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

    secret = decrypt_secret(user.totp_secret)
    if not verify_totp_code(secret, body.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie("access_token", access_token, httponly=True, samesite="lax", max_age=900)
    response.set_cookie("refresh_token", refresh_token, httponly=True, samesite="lax", max_age=604800)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, response: Response):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access_token = create_access_token({"sub": payload["sub"]})
    refresh_token = create_refresh_token({"sub": payload["sub"]})

    response.set_cookie("access_token", access_token, httponly=True, samesite="lax", max_age=900)
    response.set_cookie("refresh_token", refresh_token, httponly=True, samesite="lax", max_age=604800)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
