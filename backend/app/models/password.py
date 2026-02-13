import uuid

from sqlalchemy import String, Text, LargeBinary, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Password(TimestampMixin, Base):
    __tablename__ = "passwords"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("password_categories.id", ondelete="SET NULL"), nullable=True)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", backref="passwords", lazy="selectin")
    category = relationship("PasswordCategory", backref="passwords", lazy="selectin")
