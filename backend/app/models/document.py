import uuid

from sqlalchemy import String, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Document(TimestampMixin, Base):
    __tablename__ = "documents"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", backref="documents", lazy="selectin")
    folder = relationship("DocumentFolder", backref="documents", lazy="selectin")
    versions = relationship("DocumentVersion", back_populates="document", lazy="selectin", order_by="DocumentVersion.version.desc()")
