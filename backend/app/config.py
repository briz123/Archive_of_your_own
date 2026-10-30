import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MAX_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(50 * 1024 * 1024)))
ADVANCED_SEARCH_ENABLED = os.getenv(
    "ENABLE_ADVANCED_SEARCH", "true"
).strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_SECURE = os.getenv(
    "SESSION_COOKIE_SECURE", "false"
).strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_NAME = "ayo_session"
CSRF_COOKIE_NAME = "ayo_csrf"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14
TRUSTED_FRONTEND_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "TRUSTED_FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
}
UPLOAD_STORAGE_DIR = Path(
    os.getenv("UPLOAD_STORAGE_DIR", str(Path(__file__).resolve().parents[1] / "uploads"))
)


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and configure it."
        )
    return database_url
