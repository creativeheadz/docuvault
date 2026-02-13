from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DocumentTemplate(TimestampMixin, Base):
    __tablename__ = "document_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
