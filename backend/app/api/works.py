from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Work
from app.schemas.work import WorkRead

router = APIRouter(prefix="/api/works", tags=["works"])


@router.get("", response_model=list[WorkRead])
def list_works(db: Session = Depends(get_db)) -> list[Work]:
    statement = select(Work).options(selectinload(Work.files)).order_by(Work.id)
    return list(db.scalars(statement).all())


@router.get("/{work_id}", response_model=WorkRead)
def get_work(work_id: int, db: Session = Depends(get_db)) -> Work:
    statement = (
        select(Work)
        .options(selectinload(Work.files))
        .where(Work.id == work_id)
    )
    work = db.scalar(statement)
    if work is None:
        raise HTTPException(status_code=404, detail="Work not found")
    return work
