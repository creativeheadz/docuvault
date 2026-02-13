import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, union_all, literal_column, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.organization import Organization
from app.models.configuration import Configuration
from app.models.password import Password
from app.models.document import Document
from app.models.domain import Domain
from app.models.contact import Contact
from app.models.location import Location
from app.models.ssl_certificate import SSLCertificate
from app.models.user import User

router = APIRouter(prefix="/search", tags=["search"])


class SearchResult(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int


@router.get("", response_model=SearchResponse)
async def global_search(
    q: str = Query("", min_length=1, max_length=255),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pattern = f"%{q}%"

    # Build individual queries for each entity type
    org_q = (
        select(
            literal_column("'organization'").label("entity_type"),
            Organization.id.label("entity_id"),
            Organization.name.label("name"),
        )
        .where(Organization.name.ilike(pattern))
        .where(Organization.archived_at.is_(None))
    )

    config_q = (
        select(
            literal_column("'configuration'").label("entity_type"),
            Configuration.id.label("entity_id"),
            Configuration.name.label("name"),
        )
        .where(Configuration.name.ilike(pattern))
        .where(Configuration.archived_at.is_(None))
    )

    password_q = (
        select(
            literal_column("'password'").label("entity_type"),
            Password.id.label("entity_id"),
            Password.name.label("name"),
        )
        .where(Password.name.ilike(pattern))
        .where(Password.archived_at.is_(None))
    )

    document_q = (
        select(
            literal_column("'document'").label("entity_type"),
            Document.id.label("entity_id"),
            Document.title.label("name"),
        )
        .where(Document.title.ilike(pattern))
        .where(Document.archived_at.is_(None))
    )

    domain_q = (
        select(
            literal_column("'domain'").label("entity_type"),
            Domain.id.label("entity_id"),
            Domain.domain_name.label("name"),
        )
        .where(Domain.domain_name.ilike(pattern))
        .where(Domain.archived_at.is_(None))
    )

    contact_q = (
        select(
            literal_column("'contact'").label("entity_type"),
            Contact.id.label("entity_id"),
            Contact.first_name.label("name"),
        )
        .where(
            (Contact.first_name.ilike(pattern)) | (Contact.last_name.ilike(pattern)) | (Contact.email.ilike(pattern))
        )
        .where(Contact.archived_at.is_(None))
    )

    location_q = (
        select(
            literal_column("'location'").label("entity_type"),
            Location.id.label("entity_id"),
            Location.name.label("name"),
        )
        .where(Location.name.ilike(pattern))
        .where(Location.archived_at.is_(None))
    )

    ssl_q = (
        select(
            literal_column("'ssl_certificate'").label("entity_type"),
            SSLCertificate.id.label("entity_id"),
            SSLCertificate.common_name.label("name"),
        )
        .where(SSLCertificate.common_name.ilike(pattern))
        .where(SSLCertificate.archived_at.is_(None))
    )

    combined = union_all(org_q, config_q, password_q, document_q, domain_q, contact_q, location_q, ssl_q).subquery()

    # Count total
    from sqlalchemy import func
    count_result = await db.execute(select(func.count()).select_from(combined))
    total = count_result.scalar() or 0

    # Paginated results
    result = await db.execute(
        select(combined).offset((page - 1) * page_size).limit(page_size)
    )
    rows = result.all()

    results = [
        SearchResult(entity_type=row.entity_type, entity_id=row.entity_id, name=row.name)
        for row in rows
    ]

    return SearchResponse(results=results, total=total)
