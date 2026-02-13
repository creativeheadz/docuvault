import uuid
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str | None
    full_name: str | None
    is_active: bool
    totp_enabled: bool

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    mfa_required: bool = False
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    mfa_token: str | None = None


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    totp_code: str


class TotpSetupResponse(BaseModel):
    secret: str
    qr_code: str
    provisioning_uri: str


class TotpVerifyRequest(BaseModel):
    totp_code: str


class TotpStatusResponse(BaseModel):
    totp_enabled: bool
