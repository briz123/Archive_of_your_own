from pathlib import Path
from zipfile import ZIP_STORED, BadZipFile, ZipFile, is_zipfile

from app.config import MAX_UPLOAD_SIZE_BYTES

MAX_UNCOMPRESSED_SIZE_BYTES = 200 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 10_000
EPUB_MIMETYPE = b"application/epub+zip"


class InvalidEPUBError(ValueError):
    pass


def normalize_original_filename(filename: str) -> str:
    normalized = filename.replace("\\", "/").rsplit("/", maxsplit=1)[-1]
    if normalized in ("", ".", ".."):
        raise InvalidEPUBError("A valid filename is required.")
    if len(normalized) > 500:
        raise InvalidEPUBError("The filename exceeds the 500 character limit.")
    return normalized


def validate_epub(path: Path, original_filename: str) -> int:
    if Path(normalize_original_filename(original_filename)).suffix.lower() != ".epub":
        raise InvalidEPUBError("Only .epub files are accepted.")

    file_size = path.stat().st_size
    if file_size == 0:
        raise InvalidEPUBError("The uploaded file is empty.")
    if file_size > MAX_UPLOAD_SIZE_BYTES:
        limit_mib = MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
        raise InvalidEPUBError(f"The EPUB exceeds the {limit_mib:g} MiB upload limit.")
    if not is_zipfile(path):
        raise InvalidEPUBError("The uploaded file is not a valid EPUB archive.")

    try:
        with ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_ENTRIES:
                raise InvalidEPUBError("The EPUB contains too many archive entries.")
            if not entries or entries[0].filename != "mimetype":
                raise InvalidEPUBError("The EPUB archive is missing its mimetype entry.")
            if entries[0].compress_type != ZIP_STORED:
                raise InvalidEPUBError("The EPUB mimetype entry must not be compressed.")
            if sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_SIZE_BYTES:
                raise InvalidEPUBError("The EPUB expands beyond the allowed size.")
            if archive.read(entries[0]) != EPUB_MIMETYPE:
                raise InvalidEPUBError("The archive does not have the EPUB mimetype.")
            damaged_entry = archive.testzip()
            if damaged_entry is not None:
                raise InvalidEPUBError("The EPUB archive is damaged.")
    except (BadZipFile, OSError, RuntimeError, EOFError) as error:
        raise InvalidEPUBError("The uploaded file is not a valid EPUB archive.") from error

    return file_size
