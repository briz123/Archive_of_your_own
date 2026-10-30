import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional, TypedDict
from zipfile import BadZipFile

from ebooklib import epub
from lxml import etree

from app.models import ArchiveWarningType, Rating, TagType, WorkCategory


class EPUBMetadataError(ValueError):
    pass


class ExtractedTag(TypedDict):
    name: str
    tag_type: TagType


class ExtractedEPUBMetadata(TypedDict):
    title: str
    original_author: Optional[str]
    description: Optional[str]
    language: Optional[str]
    rating: Optional[Rating]
    category: Optional[WorkCategory]
    warnings: list[ArchiveWarningType]
    tags: list[ExtractedTag]


class _DescriptionTextParser(HTMLParser):
    BLOCK_TAGS = {"address", "article", "blockquote", "br", "div", "li", "p"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in self.BLOCK_TAGS:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in self.BLOCK_TAGS:
            self.parts.append(" ")


def _plain_description(description: Optional[str]) -> Optional[str]:
    if description is None:
        return None

    parser = _DescriptionTextParser()
    parser.feed(description)
    text = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
    return text or None


def _first_metadata(
    book: epub.EpubBook, namespace: str, name: str
) -> Optional[str]:
    values = book.get_metadata(namespace, name)
    if not values:
        return None
    value = values[0][0]
    return value.strip() if isinstance(value, str) and value.strip() else None


def _extract_subject_metadata(
    book: epub.EpubBook,
) -> tuple[
    Optional[Rating],
    Optional[WorkCategory],
    list[ArchiveWarningType],
    list[ExtractedTag],
]:
    ratings = {rating.value.casefold(): rating for rating in Rating}
    categories = {category.value.casefold(): category for category in WorkCategory}
    warnings_by_name = {
        warning.value.casefold(): warning for warning in ArchiveWarningType
    }
    tag_type = TagType.FANDOM
    tag_section_markers = {
        "other relationship tags to be added": TagType.CHARACTER,
        "other character tags to be added": TagType.ADDITIONAL,
        "other additional tags to be added": TagType.ADDITIONAL,
    }
    rating: Optional[Rating] = None
    category: Optional[WorkCategory] = None
    warnings: list[ArchiveWarningType] = []
    tags: list[ExtractedTag] = []
    seen_tags: set[tuple[TagType, str]] = set()

    for raw_subject, _ in book.get_metadata("DC", "subject"):
        if not isinstance(raw_subject, str):
            continue
        subject = raw_subject.strip()
        normalized = subject.casefold()
        if not subject or normalized == "fanworks":
            continue
        if normalized in tag_section_markers:
            tag_type = tag_section_markers[normalized]
            continue
        if normalized in ratings:
            if rating is None:
                rating = ratings[normalized]
            continue
        if normalized in categories:
            if category is None:
                category = categories[normalized]
            continue
        if normalized in warnings_by_name:
            warning = warnings_by_name[normalized]
            if warning not in warnings:
                warnings.append(warning)
            continue

        subject_type = tag_type
        if tag_type == TagType.FANDOM and (
            "/" in subject or " & " in subject
        ):
            subject_type = TagType.RELATIONSHIP
        tag_key = (subject_type, normalized)
        if tag_key not in seen_tags:
            seen_tags.add(tag_key)
            tags.append({"name": subject, "tag_type": subject_type})

    return rating, category, warnings, tags


def extract_metadata(path: Path, original_filename: str) -> ExtractedEPUBMetadata:
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

    rating, category, warnings, tags = _extract_subject_metadata(book)
    return {
        "title": _first_metadata(book, "DC", "title")
        or Path(original_filename).stem,
        "original_author": _first_metadata(book, "DC", "creator"),
        "description": _plain_description(
            _first_metadata(book, "DC", "description")
        ),
        "language": _first_metadata(book, "DC", "language"),
        "rating": rating,
        "category": category,
        "warnings": warnings,
        "tags": tags,
    }
