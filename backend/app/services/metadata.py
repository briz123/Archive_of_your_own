from pathlib import Path
from typing import Optional
from zipfile import BadZipFile

from ebooklib import epub
from lxml import etree


class EPUBMetadataError(ValueError):
    pass


def _first_metadata(
    book: epub.EpubBook, namespace: str, name: str
) -> Optional[str]:
    values = book.get_metadata(namespace, name)
    if not values:
        return None
    value = values[0][0]
    return value.strip() if isinstance(value, str) and value.strip() else None


def extract_metadata(path: Path, original_filename: str) -> dict[str, Optional[str]]:
    try:
        book = epub.read_epub(str(path), options={"ignore_ncx": True})
    except (
        epub.EpubException,
        BadZipFile,
        KeyError,
        OSError,
        ValueError,
        etree.XMLSyntaxError,
    ) as error:
        raise EPUBMetadataError("Could not read EPUB metadata.") from error

    return {
        "title": _first_metadata(book, "DC", "title")
        or Path(original_filename).stem,
        "original_author": _first_metadata(book, "DC", "creator"),
        "description": _first_metadata(book, "DC", "description"),
        "language": _first_metadata(book, "DC", "language"),
    }
