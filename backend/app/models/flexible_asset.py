import uuid

from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class FlexibleAsset(TimestampMixin, Base):
    __tablename__ = "flexible_assets"

    asset_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("flexible_asset_types.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_values: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    asset_type = relationship("FlexibleAssetType", lazy="selectin")
    organization = relationship("Organization", backref="flexible_assets", lazy="selectin")
