from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.works import router as works_router
from app.api.auth import router as auth_router
from app.config import TRUSTED_FRONTEND_ORIGINS
from app.database import get_db
import psycopg2
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Archive of Your Own")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(TRUSTED_FRONTEND_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.include_router(auth_router)
app.include_router(works_router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    errors = [
        {
            "loc": item.get("loc", []),
            "msg": item.get("msg", "Invalid value."),
            "type": item.get("type", "value_error"),
        }
        for item in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "message": "Connected to the AYO backend."}




def main():
    database_url = os.getenv("DATABASE_URL")

    conn = psycopg2.connect(database_url)

    query_sql = 'SELECT VERSION()'

    cur = conn.cursor()
    cur.execute(query_sql)

    version = cur.fetchone()[0]
    print(version)


if __name__ == "__main__":
    main()