import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import hash_password, verify_password
from app.models.user import User

logger = logging.getLogger(__name__)


async def seed_user(db: AsyncSession) -> None:
    result = await db.execute(select(User).where(User.username == settings.SEED_USERNAME))
    existing = result.scalar_one_or_none()
    if existing:
        logger.info("Seed user '%s' already exists, skipping.", settings.SEED_USERNAME)
        return

    user = User(
        username=settings.SEED_USERNAME,
        email=f"{settings.SEED_USERNAME}@docuvault.local",
        password_hash=hash_password(settings.SEED_PASSWORD),
        full_name="Andrei Trimbitas",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    logger.info("Seed user '%s' created successfully.", settings.SEED_USERNAME)


async def authenticate(db: AsyncSession, username: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    return user
