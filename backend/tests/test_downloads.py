import hashlib
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api import downloads
from app.database import SessionLocal
from app.main import app
from app.models import Work, WorkFile

client = TestClient(app)


@pytest.fixture
def upload_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Path]:
    monkeypatch.setattr(downloads, "UPLOAD_STORAGE_DIR", tmp_path)
    yield tmp_path


def create_work_with_file(
    content: bytes,
    storage_filename: str,
    original_filename: str = "My Original Book.epub",
) -> int:
    with SessionLocal() as db:
        work = Work(title="Download Test Work")
        work.files.append(
            WorkFile(
                original_filename=original_filename,
                storage_filename=storage_filename,
                file_format="EPUB",
                file_size=len(content),
                checksum=hashlib.sha256(content).hexdigest(),
            )
        )
        db.add(work)
        db.commit()
        db.refresh(work)
        return work.id


def delete_work(work_id: int) -> None:
    with SessionLocal() as db:
        work = db.get(Work, work_id)
        if work is not None:
            db.delete(work)
            db.commit()


def test_download_returns_original_bytes_and_filename(
    upload_directory: Path,
) -> None:
    content = b"original EPUB file bytes"
    storage_filename = "download-test-original.epub"
    (upload_directory / storage_filename).write_bytes(content)
    work_id = create_work_with_file(content, storage_filename)

    try:
        response = client.get(f"/api/works/{work_id}/download")

        assert response.status_code == 200
        assert response.content == content
        assert response.headers["content-type"] == "application/epub+zip"
        assert "filename*=utf-8''My%20Original%20Book.epub" in response.headers[
            "content-disposition"
        ]
        assert hashlib.sha256(response.content).hexdigest() == hashlib.sha256(
            content
        ).hexdigest()
    finally:
        delete_work(work_id)


def test_download_names_pdf_conversion_as_epub(upload_directory: Path) -> None:
    content = b"converted EPUB file bytes"
    storage_filename = "download-converted-pdf.epub"
    (upload_directory / storage_filename).write_bytes(content)
    work_id = create_work_with_file(
        content,
        storage_filename,
        original_filename="My Original Book.pdf",
    )

    try:
        response = client.get(f"/api/works/{work_id}/download")

        assert response.status_code == 200
        assert response.content == content
        assert "filename*=utf-8''My%20Original%20Book.epub" in response.headers[
            "content-disposition"
        ]
    finally:
        delete_work(work_id)


def test_download_returns_404_for_missing_work() -> None:
    response = client.get("/api/works/2147483647/download")

    assert response.status_code == 404
    assert response.json()["detail"] == "Work not found"


def test_download_returns_404_when_stored_file_is_missing(
    upload_directory: Path,
) -> None:
    work_id = create_work_with_file(b"missing file", "missing.epub")

    try:
        response = client.get(f"/api/works/{work_id}/download")

        assert response.status_code == 404
        assert response.json()["detail"] == "Stored file not found"
    finally:
        delete_work(work_id)


def test_download_does_not_allow_stored_path_to_escape_storage(
    upload_directory: Path, tmp_path: Path
) -> None:
    outside_file = tmp_path.parent / "outside-download-test.epub"
    outside_file.write_bytes(b"must not be downloadable")
    work_id = create_work_with_file(
        outside_file.read_bytes(),
        f"../{outside_file.name}",
        original_filename="outside.epub",
    )

    try:
        response = client.get(f"/api/works/{work_id}/download")

        assert response.status_code == 404
        assert response.json()["detail"] == "Stored file not found"
    finally:
        delete_work(work_id)
        outside_file.unlink(missing_ok=True)
