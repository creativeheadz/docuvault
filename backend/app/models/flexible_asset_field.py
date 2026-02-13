import uuid

from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class FlexibleAssetField(TimestampMixin, Base):
    __tablename__ = "flexible_asset_fields"

    asset_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("flexible_asset_types.id", ondelete="CASCADE"), nullable=False)
    section_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("flexible_asset_sections.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)  # text, textarea, number, date, select, multiselect, checkbox, url, email, ip, password, tag, asset_link, rich_text, file
    hint: Mapped[str | None] = mapped_column(String(500), nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # choices for select, etc.
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    asset_type = relationship("FlexibleAssetType", back_populates="fields")
    section = relationship("FlexibleAssetSection", back_populates="fields")
