import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple
from uuid import uuid4

from fastapi import UploadFile

from app.config import MAX_UPLOAD_SIZE_BYTES, UPLOAD_STORAGE_DIR

CHUNK_SIZE_BYTES = 1024 * 1024


class UploadTooLargeError(ValueError):
    pass


@dataclass(frozen=True)
class StagedUpload:
    path: Path
    file_size: int
    checksum: str


async def stage_upload(upload: UploadFile) -> StagedUpload:
    UPLOAD_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        prefix=".staged-",
        suffix=".tmp",
        dir=UPLOAD_STORAGE_DIR,
        delete=False,
    ) as temporary_file:
        temporary_path = Path(temporary_file.name)

    size = 0
    checksum = hashlib.sha256()
    complete = False
    try:
        with temporary_path.open("wb") as staged_file:
            while chunk := await upload.read(CHUNK_SIZE_BYTES):
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE_BYTES:
                    raise UploadTooLargeError("The upload exceeds the configured size limit.")
                checksum.update(chunk)
                staged_file.write(chunk)
        complete = True
        return StagedUpload(temporary_path, size, checksum.hexdigest())
    finally:
        if not complete:
            temporary_path.unlink(missing_ok=True)


def describe_staged_file(path: Path) -> StagedUpload:
    size = path.stat().st_size
    if size > MAX_UPLOAD_SIZE_BYTES:
        raise UploadTooLargeError("The converted EPUB exceeds the configured size limit.")

    checksum = hashlib.sha256()
    with path.open("rb") as staged_file:
        while chunk := staged_file.read(CHUNK_SIZE_BYTES):
            checksum.update(chunk)
    return StagedUpload(path, size, checksum.hexdigest())


def store_staged_upload(staged_upload: StagedUpload) -> Tuple[str, Path]:
    storage_filename = f"{uuid4().hex}.epub"
    stored_path = UPLOAD_STORAGE_DIR / storage_filename
    os.replace(staged_upload.path, stored_path)
    return storage_filename, stored_path
