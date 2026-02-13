import uuid

from sqlalchemy import String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class IPWhitelist(TimestampMixin, Base):
    __tablename__ = "ip_whitelist"

    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
