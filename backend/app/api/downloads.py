from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import UPLOAD_STORAGE_DIR
from app.database import get_db
from app.models import Work, WorkFile

router = APIRouter(prefix="/api/works", tags=["downloads"])


@router.get("/{work_id}/download")
def download_work(
    work_id: int,
    db: Session = Depends(get_db),
) -> FileResponse:
    work = db.get(Work, work_id)
    if work is None:
        raise HTTPException(status_code=404, detail="Work not found")

    work_file = db.scalar(
        select(WorkFile)
        .where(WorkFile.work_id == work_id)
        .order_by(WorkFile.id)
    )
    if work_file is None:
        raise HTTPException(status_code=404, detail="No downloadable file found")

    storage_root = UPLOAD_STORAGE_DIR.resolve()
    stored_path = (storage_root / work_file.storage_filename).resolve()
    try:
        stored_path.relative_to(storage_root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Stored file not found") from error

    if not stored_path.is_file():
        raise HTTPException(status_code=404, detail="Stored file not found")

    original_filename = Path(work_file.original_filename).name
    return FileResponse(
        path=stored_path,
        media_type="application/epub+zip",
        filename=original_filename,
    )
