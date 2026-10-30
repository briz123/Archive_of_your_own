from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.uploads import router as uploads_router
from app.api.downloads import router as downloads_router
from app.api.works import router as works_router
from app.api.auth import router as auth_router
from app.database import get_db

app = FastAPI(title="Archive of Your Own")
app.include_router(auth_router)
app.include_router(works_router)
app.include_router(uploads_router)
app.include_router(downloads_router)


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
