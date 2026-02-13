from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import TotpSetupResponse, TotpVerifyRequest, TotpStatusResponse
from app.services.mfa_service import (
    generate_totp_secret,
    get_provisioning_uri,
    generate_qr_data_url,
    verify_totp_code,
    encrypt_secret,
)

router = APIRouter(prefix="/mfa", tags=["mfa"])


@router.get("/status", response_model=TotpStatusResponse)
async def mfa_status(current_user: User = Depends(get_current_user)):
    return TotpStatusResponse(totp_enabled=current_user.totp_enabled)


@router.post("/setup", response_model=TotpSetupResponse)
async def mfa_setup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is already enabled. Disable it first.",
        )

    secret = generate_totp_secret()
    uri = get_provisioning_uri(secret, current_user.username)
    qr_code = generate_qr_data_url(uri)

    current_user.totp_secret = secret
    await db.commit()

    return TotpSetupResponse(secret=secret, qr_code=qr_code, provisioning_uri=uri)


@router.post("/enable")
async def mfa_enable(
    body: TotpVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is already enabled.",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Call /mfa/setup first.",
        )

    if not verify_totp_code(current_user.totp_secret, body.totp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code.",
        )

    current_user.totp_secret = encrypt_secret(current_user.totp_secret)
    current_user.totp_enabled = True
    await db.commit()

    return {"message": "TOTP enabled successfully."}


@router.post("/disable")
async def mfa_disable(
    body: TotpVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is not enabled.",
        )

    from app.services.mfa_service import decrypt_secret

    secret = decrypt_secret(current_user.totp_secret)
    if not verify_totp_code(secret, body.totp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code.",
        )

    current_user.totp_secret = None
    current_user.totp_enabled = False
    await db.commit()

    return {"message": "TOTP disabled successfully."}
