import re
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Optional
from zipfile import ZIP_STORED, ZipFile

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Font
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from starlette.background import BackgroundTask

from app.config import UPLOAD_STORAGE_DIR
from app.database import get_db
from app.models import TagType, Work, WorkFile

router = APIRouter(prefix="/api/works", tags=["downloads"])
MAX_BUNDLE_WORKS = 50
METADATA_COLUMNS = (
    "Work ID",
    "Title",
    "Author",
    "Description",
    "Language",
    "Word count",
    "Chapter count",
    "Rating",
    "Category",
    "Completion status",
    "Published at",
    "Uploaded at",
    "Fandoms",
    "Relationships",
    "Characters",
    "Additional tags",
    "Archive warnings",
    "Original filename",
)


class DownloadBundleRequest(BaseModel):
    work_ids: list[int] = Field(min_length=1, max_length=MAX_BUNDLE_WORKS)

    @field_validator("work_ids")
    @classmethod
    def validate_work_ids(cls, value: list[int]) -> list[int]:
        if any(work_id <= 0 for work_id in value):
            raise ValueError("Work IDs must be positive integers.")
        if len(set(value)) != len(value):
            raise ValueError("Work IDs must not contain duplicates.")
        return value


def _safe_excel_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    safe_value = ILLEGAL_CHARACTERS_RE.sub("", value[:32767])
    if safe_value.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{safe_value}"
    return safe_value


def _metadata_workbook(works: list[Work]) -> BytesIO:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Fic metadata"
    worksheet.append(METADATA_COLUMNS)
    for cell in worksheet[1]:
        cell.font = Font(bold=True)

    for work in works:
        tags_by_type = {
            tag_type: ", ".join(
                tag.name for tag in work.tags if tag.tag_type == tag_type
            )
            for tag_type in TagType
        }
        work_file = work.files[0]
        worksheet.append(
            [
                work.id,
                _safe_excel_text(work.title),
                _safe_excel_text(work.original_author),
                _safe_excel_text(work.description),
                _safe_excel_text(work.language),
                work.word_count,
                work.chapter_count,
                _safe_excel_text(work.rating.value if work.rating else None),
                _safe_excel_text(work.category.value if work.category else None),
                _safe_excel_text(work.completion_status),
                work.published_at.isoformat() if work.published_at else None,
                work.created_at.isoformat() if work.created_at else None,
                _safe_excel_text(tags_by_type[TagType.FANDOM]),
                _safe_excel_text(tags_by_type[TagType.RELATIONSHIP]),
                _safe_excel_text(tags_by_type[TagType.CHARACTER]),
                _safe_excel_text(tags_by_type[TagType.ADDITIONAL]),
                _safe_excel_text(
                    ", ".join(warning.name.value for warning in work.warnings)
                ),
                _safe_excel_text(Path(work_file.original_filename).name),
            ]
        )

    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    worksheet.column_dimensions["A"].width = 12
    worksheet.column_dimensions["B"].width = 32
    worksheet.column_dimensions["C"].width = 24
    worksheet.column_dimensions["D"].width = 60
    for column in "EFGHIJKLMNOPQR":
        worksheet.column_dimensions[column].width = 20

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output


def _stored_file_path(storage_filename: str) -> Path:
    storage_root = UPLOAD_STORAGE_DIR.resolve()
    stored_path = (storage_root / storage_filename).resolve()
    try:
        stored_path.relative_to(storage_root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Stored file not found") from error
    if not stored_path.is_file():
        raise HTTPException(status_code=404, detail="Stored file not found")
    return stored_path


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

    stored_path = _stored_file_path(work_file.storage_filename)
    original_filename = Path(work_file.original_filename).name
    download_filename = (
        f"{Path(original_filename).stem}.epub"
        if work_file.file_format == "EPUB"
        else original_filename
    )
    return FileResponse(
        path=stored_path,
        media_type="application/epub+zip",
        filename=download_filename,
    )


@router.post("/download-bundle")
def download_work_bundle(
    request: DownloadBundleRequest,
    db: Session = Depends(get_db),
) -> FileResponse:
    works_by_id = {
        work.id: work
        for work in db.scalars(
            select(Work)
            .where(Work.id.in_(request.work_ids))
            .options(
                selectinload(Work.files),
                selectinload(Work.tags),
                selectinload(Work.warnings),
            )
        ).all()
    }
    if len(works_by_id) != len(request.work_ids):
        raise HTTPException(
            status_code=404,
            detail="One or more selected works were not found.",
        )

    works = [works_by_id[work_id] for work_id in request.work_ids]
    downloadable_files: list[tuple[Work, WorkFile, Path]] = []
    for work in works:
        work_file = min(work.files, key=lambda item: item.id) if work.files else None
        if work_file is None:
            raise HTTPException(
                status_code=404,
                detail=f"No downloadable file found for work {work.id}.",
            )
        downloadable_files.append(
            (work, work_file, _stored_file_path(work_file.storage_filename))
        )

    workbook = _metadata_workbook(works)
    with tempfile.NamedTemporaryFile(
        prefix="ayo-download-",
        suffix=".zip",
        delete=False,
    ) as temporary_file:
        bundle_path = Path(temporary_file.name)

    response_ready = False
    try:
        with ZipFile(bundle_path, "w", compression=ZIP_STORED) as archive:
            archive.writestr("metadata.xlsx", workbook.getvalue())
            for work, work_file, stored_path in downloadable_files:
                original_name = Path(work_file.original_filename).name
                stem = Path(original_name).stem
                safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
                if not safe_stem:
                    safe_stem = f"work-{work.id}"
                archive.write(
                    stored_path,
                    arcname=f"fanfics/{work.id}-{safe_stem}.epub",
                )

        response = FileResponse(
            path=bundle_path,
            media_type="application/zip",
            filename="fanfics-with-metadata.zip",
            background=BackgroundTask(bundle_path.unlink, missing_ok=True),
        )
        response_ready = True
        return response
    finally:
        if not response_ready:
            bundle_path.unlink(missing_ok=True)
