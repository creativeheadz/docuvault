import hashlib
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class RefreshToken(TimestampMixin, Base):
    """One issued refresh token, so that a session can be ended.

    Refresh tokens were stateless: `/auth/refresh` accepted anything
    correctly signed and minted a fresh pair, `/auth/logout` only cleared
    cookies, and nothing anywhere recorded that a token existed. A stolen
    one therefore stayed good for its full seven days and could renew itself
    indefinitely, and there was no way to kick a session short of rotating
    SECRET_KEY and signing everybody out at once.

    Giving the token a row costs one indexed lookup on refresh - which
    happens once every fifteen minutes per session - and buys revocation,
    an answer to "what is signed in right now", and reuse detection.

    Only the SHA-256 lands here, for the same reason as `ApiToken`: a
    database disclosure should not hand anybody a working credential. The
    hash is of the whole signed JWT, so a token that does not verify never
    reaches this table at all.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True)

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)

    # Set when this token is rotated, so a presented-but-already-rotated
    # token can be told apart from one that was simply revoked. The first
    # is evidence of theft; the second is somebody signing out.
    replaced_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Enough to recognise a session in a list without being a tracking
    # record: "Firefox on the office machine, last Tuesday".
    created_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    @property
    def is_live(self) -> bool:
        return self.revoked_at is None and self.replaced_by is None

    def __repr__(self) -> str:
        return f"<RefreshToken user={self.user_id} live={self.is_live}>"


def hash_refresh_token(raw: str) -> str:
    """SHA-256 of the signed token.

    Not bcrypt: a JWT signed with a 64-byte key is not guessable, so a slow
    KDF would buy nothing and would add a bcrypt round to every refresh.
    """
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
