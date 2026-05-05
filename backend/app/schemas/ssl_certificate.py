import uuid
from datetime import datetime, date
from pydantic import BaseModel


class SSLCertificateCreate(BaseModel):
    organization_id: uuid.UUID
    common_name: str
    issuer: str | None = None
    issued_date: date | None = None
    expiration_date: date | None = None
    sans: list[str] | None = None
    key_algorithm: str | None = None
    notes: str | None = None


class SSLCertificateUpdate(BaseModel):
    common_name: str | None = None
    issuer: str | None = None
    issued_date: date | None = None
    expiration_date: date | None = None
    sans: list[str] | None = None
    key_algorithm: str | None = None
    notes: str | None = None


class SSLCertificateResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    common_name: str
    issuer: str | None
    issued_date: date | None
    expiration_date: date | None
    sans: list[str] | None
    key_algorithm: str | None
    notes: str | None
    host: str | None = None
    port: int | None = None
    subject_cn: str | None = None
    signature_algorithm: str | None = None
    key_size: int | None = None
    serial_number: str | None = None
    last_probed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SSLProbeRequest(BaseModel):
    host: str | None = None
    port: int | None = None


class SSLProbeResponse(BaseModel):
    certificate: SSLCertificateResponse
    tls_version: str | None
    cipher: str | None
    is_expired: bool
    days_until_expiry: int
