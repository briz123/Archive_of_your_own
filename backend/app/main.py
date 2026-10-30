from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.uploads import router as uploads_router
from app.api.works import router as works_router
from app.database import get_db

app = FastAPI(title="Archive of Your Own")
app.include_router(works_router)
app.include_router(uploads_router)


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "message": "Connected to the AYO backend."}
