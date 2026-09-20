import logging
import subprocess
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.database import async_session
from app.services.auth_service import seed_user
from app.api.v1.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migrations():
    logger.info("Running database migrations...")
    alembic_cfg = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
    subprocess.run(["alembic", "-c", alembic_cfg, "upgrade", "head"], check=True)
    logger.info("Migrations complete.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    async with async_session() as db:
        await seed_user(db)
    logger.info("Application started.")
    yield
    logger.info("Application shutdown.")


_IS_PRODUCTION = settings.ENVIRONMENT.strip().lower() == "production"

# The schema lists all 115 routes with their shapes. That is a convenience
# in development and a map for somebody else in production, so it is served
# only in development. The frontend proxy only forwards /api/, so this is
# the control that matters when the backend port is reachable directly.
app = FastAPI(
    title="DocuVault API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if _IS_PRODUCTION else "/docs",
    redoc_url=None if _IS_PRODUCTION else "/redoc",
    openapi_url=None if _IS_PRODUCTION else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
