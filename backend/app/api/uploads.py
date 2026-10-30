from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArchiveWarning, Tag, TagAlias, Work, WorkFile
from app.schemas.work import WorkRead
from app.services.file_validation import (
    InvalidEPUBError,
    normalize_original_filename,
    validate_epub,
)
from app.services.metadata import EPUBMetadataError, extract_metadata
from app.services.storage import (
    StagedUpload,
    UploadTooLargeError,
    stage_upload,
    store_staged_upload,
)

router = APIRouter(prefix="/api/works", tags=["works"])


@router.post(
    "/upload",
    response_model=WorkRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_work(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Work:
    try:
        original_filename = normalize_original_filename(file.filename or "")
    except InvalidEPUBError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    staged_upload: Optional[StagedUpload] = None
    stored_path = None
    committed = False
    try:
        staged_upload = await stage_upload(file)
        file_size = validate_epub(staged_upload.path, original_filename)
        metadata = extract_metadata(staged_upload.path, original_filename)

        work = Work(
            title=metadata["title"] or original_filename.rsplit(".", maxsplit=1)[0],
            original_author=metadata["original_author"],
            description=metadata["description"],
            language=metadata["language"],
            rating=metadata["rating"],
            category=metadata["category"],
        )
        db.add(work)
        db.flush()

        for extracted_tag in metadata["tags"]:
            tag = db.scalar(
                select(Tag).where(
                    func.lower(Tag.name) == extracted_tag["name"].lower(),
                    Tag.tag_type == extracted_tag["tag_type"],
                )
            )
            if tag is None:
                alias = db.scalar(
                    select(TagAlias).where(
                        func.lower(TagAlias.alias_name)
                        == extracted_tag["name"].lower()
                    )
                )
                if alias is not None:
                    if alias.canonical_tag.tag_type != extracted_tag["tag_type"]:
                        raise HTTPException(
                            status_code=400,
                            detail="An EPUB tag alias conflicts with its tag type.",
                        )
                    tag = alias.canonical_tag
                else:
                    tag = Tag(
                        name=extracted_tag["name"],
                        tag_type=extracted_tag["tag_type"],
                    )
                    db.add(tag)
            work.tags.append(tag)

        if metadata["warnings"]:
            work.warnings = list(
                db.scalars(
                    select(ArchiveWarning).where(
                        ArchiveWarning.name.in_(metadata["warnings"])
                    )
                ).all()
            )

        storage_filename, stored_path = store_staged_upload(staged_upload)
        db.add(
            WorkFile(
                work=work,
                original_filename=original_filename,
                storage_filename=storage_filename,
                file_format="EPUB",
                file_size=file_size,
                checksum=staged_upload.checksum,
            )
        )
        db.commit()
        committed = True
        db.refresh(work)
        return work
    except UploadTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except (InvalidEPUBError, EPUBMetadataError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    finally:
        await file.close()
        if staged_upload is not None:
            staged_upload.path.unlink(missing_ok=True)
        if not committed:
            db.rollback()
            if stored_path is not None:
                stored_path.unlink(missing_ok=True)
