import hashlib
import secrets
import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


# The only scope that exists today. Named rather than implied, because the
# whole point of this table is that a token says what it may do and nothing
# widens it later by accident.
SCOPE_READ_CONTEXT = "read:context"
VALID_SCOPES = (SCOPE_READ_CONTEXT,)

TOKEN_PREFIX = "dvt_"


class ApiToken(TimestampMixin, Base):
    """A machine credential for another system to READ documentation.

    This exists because of one decision: DocuVault holds client credentials,
    and the thing that wants to read it (Wegweiser's AI) must never be able
    to reach them. A JWT would have been quicker - mint one for a service
    user and be done - and it would have been wrong, because a JWT here
    authenticates AS A USER and a user may call
    `POST /passwords/{id}/reveal`.

    So this is a separate credential with a separate dependency
    (`app.core.api_auth.require_token`), wired into exactly one router. The
    guarantee is structural rather than a matter of care: every other route
    in the app depends on `get_current_user`, which only accepts a JWT, and
    an ApiToken is not a JWT. There is no path from this credential to
    plaintext, and adding one would mean editing a route's dependency.

    Storage follows the usual rules for a bearer credential:

      * the token is shown ONCE, at creation, and never again
      * only its SHA-256 lands in the database, so a database disclosure
        does not hand anybody a working key
      * `prefix` exists purely so a person can tell two tokens apart in a
        list and revoke the right one

    `organization_ids` narrows a token further. An MSP integrating one
    client's Wegweiser tenant should not need to hand over a key that reads
    every client they document. Empty means every organisation, which is the
    sensible default for the single-tenant case and a deliberate choice
    rather than an absence.
    """

    __tablename__ = "api_tokens"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # First characters of the issued token, e.g. "dvt_9f3a2c1b". Enough to
    # recognise, useless to authenticate with.
    prefix: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    scopes: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    # Empty list = every organisation.
    organization_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}")

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Answers "is this still in use", which is the question you have when
    # deciding whether revoking something will break a customer's evening.
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True)

    def allows_organization(self, organization_id) -> bool:
        """True when this token may read that organisation."""
        if not self.organization_ids:
            return True
        return uuid.UUID(str(organization_id)) in [
            uuid.UUID(str(o)) for o in self.organization_ids]

    def __repr__(self) -> str:
        return f"<ApiToken {self.prefix} scopes={list(self.scopes)}>"


def hash_token(raw: str) -> str:
    """SHA-256 of a token. Not bcrypt, on purpose.

    A password is low-entropy and human-chosen, so it needs a slow hash. A
    token is 256 bits from a CSPRNG; a slow KDF would buy nothing against a
    brute force that is already impossible, and would add a bcrypt round to
    every single API call an integration makes.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_token() -> tuple[str, str, str]:
    """A new token: (full_token, prefix, sha256).

    The caller shows `full_token` once and stores the other two. It lives
    here rather than beside the FastAPI dependency because minting and
    hashing a credential is a property of the credential, and because a
    security primitive that can only be tested by standing up a web
    framework is a security primitive that does not get tested.
    """
    raw = f"{TOKEN_PREFIX}{secrets.token_hex(32)}"
    return raw, raw[:12], hash_token(raw)
