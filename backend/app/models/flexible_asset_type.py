from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class FlexibleAssetType(TimestampMixin, Base):
    __tablename__ = "flexible_asset_types"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sections = relationship("FlexibleAssetSection", back_populates="asset_type", cascade="all, delete-orphan", lazy="selectin", order_by="FlexibleAssetSection.sort_order")
    fields = relationship("FlexibleAssetField", back_populates="asset_type", cascade="all, delete-orphan", lazy="selectin", order_by="FlexibleAssetField.sort_order")
