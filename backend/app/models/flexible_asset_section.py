import uuid

from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class FlexibleAssetSection(TimestampMixin, Base):
    __tablename__ = "flexible_asset_sections"

    asset_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("flexible_asset_types.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    asset_type = relationship("FlexibleAssetType", back_populates="sections")
    fields = relationship("FlexibleAssetField", back_populates="section", lazy="selectin", order_by="FlexibleAssetField.sort_order")
