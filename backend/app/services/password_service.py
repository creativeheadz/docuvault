import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import encrypt, decrypt
from app.models.password import Password
from app.models.password_audit import PasswordAccessLog


async def encrypt_password(plaintext: str) -> bytes:
    return encrypt(plaintext)


async def decrypt_password(password: Password) -> str:
    if not password.password_encrypted:
        return ""
    return decrypt(password.password_encrypted)


async def log_access(
    db: AsyncSession,
    password_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    ip_address: str | None = None,
) -> None:
    log = PasswordAccessLog(
        password_id=password_id,
        user_id=user_id,
        action=action,
        ip_address=ip_address,
    )
    db.add(log)
    await db.flush()
