import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MAX_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(50 * 1024 * 1024)))
ADVANCED_SEARCH_ENABLED = os.getenv(
    "ENABLE_ADVANCED_SEARCH", "false"
).strip().lower() in {"1", "true", "yes", "on"}
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
