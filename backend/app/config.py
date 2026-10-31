import os

from dotenv import load_dotenv

load_dotenv()

ADVANCED_SEARCH_ENABLED = os.getenv(
    "ENABLE_ADVANCED_SEARCH", "true"
).strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_SECURE = os.getenv(
    "SESSION_COOKIE_SECURE", "true"
).strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "lax").lower()
if SESSION_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("SESSION_COOKIE_SAMESITE must be lax, strict, or none.")
if SESSION_COOKIE_SAMESITE == "none" and not SESSION_COOKIE_SECURE:
    raise RuntimeError("SESSION_COOKIE_SECURE must be true when SameSite is none.")
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


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and configure it."
        )
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url.removeprefix("postgres://")
    return database_url
