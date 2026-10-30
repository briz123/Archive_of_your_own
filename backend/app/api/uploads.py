from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.auth import CurrentUser
from app.models import ArchiveWarning, Tag, TagAlias, Work, WorkFile
from app.schemas.work import WorkRead
from app.services.file_validation import (
    InvalidEPUBError,
    normalize_original_filename,
    validate_epub,
)
from app.services.metadata import EPUBMetadataError, extract_metadata
from app.services.pdf_conversion import InvalidPDFError, convert_pdf_to_epub
from app.services.storage import (
    StagedUpload,
    UploadTooLargeError,
    describe_staged_file,
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
    user: CurrentUser,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Work:
    try:
        original_filename = normalize_original_filename(file.filename or "")
    except InvalidEPUBError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    staged_upload: Optional[StagedUpload] = None
    source_upload: Optional[StagedUpload] = None
    converted_path: Optional[Path] = None
    stored_path = None
    committed = False
    try:
        source_upload = await stage_upload(file)
        file_extension = Path(original_filename).suffix.lower()
        if file_extension == ".pdf":
            converted_path = convert_pdf_to_epub(source_upload.path, original_filename)
            staged_upload = describe_staged_file(converted_path)
            metadata_filename = f"{Path(original_filename).stem}.epub"
        elif file_extension == ".epub":
            staged_upload = source_upload
            validate_epub(staged_upload.path, original_filename)
            metadata_filename = original_filename
        else:
            raise InvalidEPUBError("Only .epub and .pdf files are accepted.")

        file_size = staged_upload.file_size
        metadata = extract_metadata(staged_upload.path, metadata_filename)

        work = Work(
            user_id=user.id,
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
                    Tag.user_id == user.id,
                    func.lower(Tag.name) == extracted_tag["name"].lower(),
                    Tag.tag_type == extracted_tag["tag_type"],
                )
            )
            if tag is None:
                alias = db.scalar(
                    select(TagAlias).where(
                        func.lower(TagAlias.alias_name)
                        == extracted_tag["name"].lower(),
                        TagAlias.canonical_tag.has(Tag.user_id == user.id),
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
                        user_id=user.id,
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
                storage_provider="legacy_server",
                status="stored",
            )
        )
        db.commit()
        committed = True
        db.refresh(work)
        return work
    except UploadTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except (InvalidEPUBError, InvalidPDFError, EPUBMetadataError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    finally:
        await file.close()
        if source_upload is not None:
            source_upload.path.unlink(missing_ok=True)
        if converted_path is not None:
            converted_path.unlink(missing_ok=True)
        if staged_upload is not None and (
            source_upload is None or staged_upload.path != source_upload.path
        ):
            staged_upload.path.unlink(missing_ok=True)
        if not committed:
            db.rollback()
            if stored_path is not None:
                stored_path.unlink(missing_ok=True)
