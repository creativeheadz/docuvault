from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://docuvault:docuvault_secret@postgres:5432/docuvault"
    DATABASE_URL_SYNC: str = "postgresql://docuvault:docuvault_secret@postgres:5432/docuvault"
    SECRET_KEY: str = "super-secret-key-change-in-production"
    ENCRYPTION_KEY: str = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"
    SEED_USERNAME: str = "andrei.trimbitas"
    SEED_PASSWORD: str = "9Palo)pad"
    CORS_ORIGINS: str = "http://localhost:3000"
    UPLOAD_DIR: str = "/app/uploads"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
