import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "development"
    public_base_url: str = "http://localhost:5173"
    database_backend: str = "sqlite"  # postgresql or sqlite
    database_url: str | None = None
    sqlite_path: str = "/data/touchctf.db"
    app_secret: str = "dev-secret-change-me"
    allowed_hosts: str = "*"
    trusted_proxy_cidrs: str = ""
    cookie_secure: bool = False
    media_dir: str = "/app/media"
    log_level: str = "INFO"
    api_workers: int = 1
    tz: str = "UTC"
    cors_origins: str = "*"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_database_url(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    url = settings.database_url
    if settings.database_backend == "postgresql":
        url = url or "postgresql://touchctf:touchctf@db:5432/touchctf"
        # SQLAlchemy defaults to psycopg2 for plain postgresql:// URLs.
        # We ship psycopg v3, so ensure the correct driver is requested.
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg" + url[len("postgresql"):]
        return url
    return url or f"sqlite:///{settings.sqlite_path}"


def load_secret_file(path: str | None, fallback: str) -> str:
    if path and os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    return fallback
