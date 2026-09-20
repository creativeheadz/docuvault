import logging
import sys

from pydantic_settings import BaseSettings


# Named rather than inlined so that the check below compares against the
# same constant the default came from, and so grep finds both at once.
DEV_SECRET_KEY = "super-secret-key-change-in-production"
DEV_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
DEV_SEED_PASSWORD = "9Palo)pad"


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://docuvault:docuvault_secret@postgres:5432/docuvault"
    DATABASE_URL_SYNC: str = "postgresql://docuvault:docuvault_secret@postgres:5432/docuvault"
    SECRET_KEY: str = DEV_SECRET_KEY
    ENCRYPTION_KEY: str = DEV_ENCRYPTION_KEY
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"
    SEED_USERNAME: str = "andrei.trimbitas"
    SEED_PASSWORD: str = DEV_SEED_PASSWORD
    CORS_ORIGINS: str = "http://localhost:3000"
    UPLOAD_DIR: str = "/app/uploads"

    # Hosts that outbound requests may reach even though they resolve
    # into private address space. Comma-separated names or literal IPs.
    # See app/core/net_guard.py for which call sites this applies to.
    OUTBOUND_ALLOWED_HOSTS: str = ""

    # "production" refuses to start on the demo secrets below and hides the
    # interactive API schema. Anything else is treated as development.
    ENVIRONMENT: str = "development"

    # AI chat for the Systems documentation page
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-haiku-4-5"
    MEMPALACE_URL: str = ""
    MEMPALACE_TOKEN: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()


def _fail_closed(cfg: "Settings") -> None:
    """Refuse to serve production traffic on the demo secrets.

    These values exist so that `docker compose up` works on a laptop without
    ceremony. The cost of that convenience was discovered on 2026-09-20: the
    live deployment had been running on every one of them, which made the
    JWT signing key a public literal and every encrypted field in the
    database readable by anyone holding the source. A default that silently
    becomes production is worse than no default, so in production these stop
    the process instead.
    """
    if cfg.ENVIRONMENT.strip().lower() != "production":
        if cfg.SECRET_KEY == DEV_SECRET_KEY or cfg.ENCRYPTION_KEY == DEV_ENCRYPTION_KEY:
            logging.getLogger(__name__).warning(
                "Running on the development secrets. Set ENVIRONMENT=production "
                "with real values before exposing this instance.")
        return

    bad = [name for name, value, dev in (
        ("SECRET_KEY", cfg.SECRET_KEY, DEV_SECRET_KEY),
        ("ENCRYPTION_KEY", cfg.ENCRYPTION_KEY, DEV_ENCRYPTION_KEY),
        ("SEED_PASSWORD", cfg.SEED_PASSWORD, DEV_SEED_PASSWORD),
    ) if value == dev]
    if bad:
        sys.exit(
            "Refusing to start: " + ", ".join(bad) + " still hold the built-in "
            "development value(s), and ENVIRONMENT=production. Generate real "
            "ones - see .env.example - and restart."
        )


_fail_closed(settings)
