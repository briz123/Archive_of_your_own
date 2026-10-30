import hashlib
from io import BytesIO
from pathlib import Path
from typing import Iterator
from zipfile import ZIP_STORED, ZipFile

import pytest
from ebooklib import ITEM_DOCUMENT, epub
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Work, WorkFile
from app.services import storage

client = TestClient(app, raise_server_exceptions=False)


def make_epub() -> bytes:
    container = b"""<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""
    package = b"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
  xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0"
  unique-identifier="book-id">
  <metadata>
    <dc:identifier id="book-id">test-book-1</dc:identifier>
    <dc:title>Test EPUB Title</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:description>&lt;p&gt;A description from the test EPUB.&lt;/p&gt;</dc:description>
    <dc:language>en</dc:language>
    <dc:subject>Teen And Up Audiences</dc:subject>
    <dc:subject>Harry Potter</dc:subject>
    <dc:subject>Hermione Granger/Draco Malfoy</dc:subject>
    <dc:subject>Other Relationship Tags to Be Added</dc:subject>
    <dc:subject>Hermione Granger</dc:subject>
    <dc:subject>Other Character Tags to Be Added</dc:subject>
    <dc:subject>Slow Burn</dc:subject>
    <dc:subject>Other Additional Tags to Be Added</dc:subject>
    <dc:subject>F/M</dc:subject>
    <dc:subject>Major Character Death</dc:subject>
  </metadata>
  <manifest/>
  <spine/>
</package>"""
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("mimetype", b"application/epub+zip", compress_type=ZIP_STORED)
        archive.writestr("META-INF/container.xml", container)
        archive.writestr("OEBPS/content.opf", package)
    return buffer.getvalue()


def make_pdf() -> bytes:
    content = b"BT /F1 12 Tf 72 720 Td (A story converted from PDF.) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
        ),
        (
            f"<< /Length {len(content)} >>\nstream\n".encode()
            + content
            + b"\nendstream"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Title (Converted Story) /Author (PDF Author) >>",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, object_data in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(object_data)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        (
            f"trailer\n<< /Size {len(offsets)} /Root 1 0 R /Info 6 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode()
    )
    return bytes(pdf)


@pytest.fixture
def upload_directory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    monkeypatch.setattr(storage, "UPLOAD_STORAGE_DIR", tmp_path)
    yield tmp_path


def test_upload_extracts_metadata_and_preserves_original(
    upload_directory: Path,
) -> None:
    epub_bytes = make_epub()

    response = client.post(
        "/api/works/upload",
        files={"file": ("../../sample.epub", epub_bytes, "application/epub+zip")},
    )

    assert response.status_code == 201
    work_data = response.json()
    assert work_data["title"] == "Test EPUB Title"
    assert work_data["original_author"] == "Test Author"
    assert work_data["description"] == "A description from the test EPUB."
    assert work_data["language"] == "en"
    assert work_data["rating"] == "Teen And Up Audiences"
    assert work_data["category"] == "F/M"
    assert work_data["warnings"] == ["Major Character Death"]
    assert {
        (tag["name"], tag["tag_type"]) for tag in work_data["tags"]
    } == {
        ("Harry Potter", "fandom"),
        ("Hermione Granger/Draco Malfoy", "relationship"),
        ("Hermione Granger", "character"),
        ("Slow Burn", "additional"),
    }
    assert len(work_data["files"]) == 1
    assert work_data["files"][0]["original_filename"] == "sample.epub"
    assert work_data["files"][0]["file_format"] == "EPUB"
    assert work_data["files"][0]["file_size"] == len(epub_bytes)
    assert work_data["files"][0]["checksum"] == hashlib.sha256(epub_bytes).hexdigest()

    work_id = work_data["id"]
    try:
        with SessionLocal() as db:
            work_file = db.scalar(
                select(WorkFile).where(WorkFile.work_id == work_id)
            )
            assert work_file is not None
            stored_file = upload_directory / work_file.storage_filename
            assert stored_file.read_bytes() == epub_bytes

        retrieved = client.get(f"/api/works/{work_id}")
        assert retrieved.status_code == 200
        assert retrieved.json()["title"] == "Test EPUB Title"
    finally:
        with SessionLocal() as db:
            work = db.get(Work, work_id)
            if work is not None:
                db.delete(work)
                db.commit()
        for path in upload_directory.iterdir():
            path.unlink()


def test_upload_converts_pdf_to_downloadable_epub(upload_directory: Path) -> None:
    response = client.post(
        "/api/works/upload",
        files={"file": ("sample.pdf", make_pdf(), "application/pdf")},
    )

    assert response.status_code == 201
    work_data = response.json()
    assert work_data["title"] == "Converted Story"
    assert work_data["original_author"] == "PDF Author"
    assert work_data["files"][0]["original_filename"] == "sample.pdf"
    assert work_data["files"][0]["file_format"] == "EPUB"

    work_id = work_data["id"]
    try:
        with SessionLocal() as db:
            work_file = db.scalar(
                select(WorkFile).where(WorkFile.work_id == work_id)
            )
            assert work_file is not None
            converted_file = upload_directory / work_file.storage_filename
            assert converted_file.is_file()
            assert converted_file.read_bytes().startswith(b"PK")

        book = epub.read_epub(str(converted_file))
        content = b" ".join(
            item.get_content() for item in book.get_items_of_type(ITEM_DOCUMENT)
        ).decode("utf-8")
        assert "A story converted from PDF." in content
    finally:
        with SessionLocal() as db:
            work = db.get(Work, work_id)
            if work is not None:
                db.delete(work)
                db.commit()
        for path in upload_directory.iterdir():
            path.unlink()


def test_invalid_epub_is_rejected_without_database_or_file_changes(
    upload_directory: Path,
) -> None:
    response = client.post(
        "/api/works/upload",
        files={"file": ("invalid.epub", b"not an EPUB", "application/epub+zip")},
    )

    assert response.status_code == 400
    assert list(upload_directory.iterdir()) == []
    with SessionLocal() as db:
        work = db.scalar(select(Work).where(Work.title == "invalid"))
        assert work is None


def test_pdf_without_extractable_text_is_rejected(
    upload_directory: Path,
) -> None:
    empty_page_pdf = make_pdf().replace(
        b"(A story converted from PDF.) Tj", b"() Tj"
    )

    response = client.post(
        "/api/works/upload",
        files={"file": ("scanned.pdf", empty_page_pdf, "application/pdf")},
    )

    assert response.status_code == 400
    assert "no extractable text" in response.json()["detail"]
    assert list(upload_directory.iterdir()) == []


def test_database_failure_removes_stored_file_and_rolls_back_work(
    upload_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_commit(self: Session) -> None:
        raise SQLAlchemyError("simulated database failure")

    monkeypatch.setattr(Session, "commit", fail_commit)

    response = client.post(
        "/api/works/upload",
        files={"file": ("sample.epub", make_epub(), "application/epub+zip")},
    )

    assert response.status_code == 500
    assert list(upload_directory.iterdir()) == []
    with SessionLocal() as db:
        work = db.scalar(select(Work).where(Work.title == "Test EPUB Title"))
        assert work is None


def test_oversized_upload_is_rejected_and_staging_file_is_removed(
    upload_directory: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage, "MAX_UPLOAD_SIZE_BYTES", 10)

    response = client.post(
        "/api/works/upload",
        files={"file": ("sample.epub", make_epub(), "application/epub+zip")},
    )

    assert response.status_code == 413
    assert list(upload_directory.iterdir()) == []
