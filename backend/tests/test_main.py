import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import Tag, TagType, Work, WorkFile

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "message": "Connected to the AYO backend.",
    }


def test_work_can_be_inserted_and_retrieved() -> None:
    with SessionLocal() as db:
        work = Work(
            title="Database Test Work",
            original_author="AYO Test",
            description="A test record proving database persistence.",
            language="en",
        )
        db.add(work)
        db.commit()
        db.refresh(work)
        work_id = work.id

    try:
        response = client.get(f"/api/works/{work_id}")

        assert response.status_code == 200
        assert response.json()["title"] == "Database Test Work"
        assert response.json()["original_author"] == "AYO Test"
        assert response.json()["files"] == []
    finally:
        with SessionLocal() as db:
            test_work = db.get(Work, work_id)
            if test_work is not None:
                db.delete(test_work)
                db.commit()


def test_works_search_matches_title_and_author_case_insensitively() -> None:
    with SessionLocal() as db:
        work = Work(
            title="Search Fixture Work",
            original_author="Author Search Fixture",
        )
        db.add(work)
        db.commit()
        db.refresh(work)
        work_id = work.id

    try:
        title_response = client.get("/api/works", params={"search": "sEaRcH fIxTuRe"})
        author_response = client.get("/api/works", params={"search": "AUTHOR SEARCH"})

        assert title_response.status_code == 200
        assert any(work["id"] == work_id for work in title_response.json())
        assert author_response.status_code == 200
        assert any(work["id"] == work_id for work in author_response.json())
    finally:
        with SessionLocal() as db:
            test_work = db.get(Work, work_id)
            if test_work is not None:
                db.delete(test_work)
                db.commit()


def test_works_search_returns_empty_list_when_nothing_matches() -> None:
    response = client.get(
        "/api/works",
        params={"search": "no-work-should-have-this-search-term"},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_works_filter_by_any_selected_fandom() -> None:
    fandom_names = {
        "Basic Search Fixture Fandom One",
        "Basic Search Fixture Fandom Two",
        "Basic Search Fixture Fandom Three",
    }

    with SessionLocal() as db:
        fandoms = [
            Tag(name=name, tag_type=TagType.FANDOM)
            for name in sorted(fandom_names)
        ]
        works = [
            Work(title=f"Basic Search Fixture Work {index}", tags=[fandom])
            for index, fandom in enumerate(fandoms, start=1)
        ]
        db.add_all(works)
        db.commit()
        fandom_ids = [fandoms[0].id, fandoms[1].id]
        work_ids = [work.id for work in works]

    try:
        response = client.get(
            "/api/works",
            params=[("fandom_id", fandom_id) for fandom_id in fandom_ids],
        )

        assert response.status_code == 200
        assert {work["id"] for work in response.json()} == set(work_ids[:2])
    finally:
        with SessionLocal() as db:
            for work_id in work_ids:
                work = db.get(Work, work_id)
                if work is not None:
                    db.delete(work)
            db.commit()
            tags = db.scalars(select(Tag).where(Tag.name.in_(fandom_names))).all()
            for tag in tags:
                if not tag.works:
                    db.delete(tag)
            db.commit()


def test_work_metadata_update_rejects_null_title() -> None:
    response = client.put("/api/works/1", json={"title": None})

    assert response.status_code == 422


def test_work_metadata_can_be_edited_and_taxonomy_is_shared(
    tmp_path: Path,
) -> None:
    original_epub = b"unchanged original EPUB bytes"
    stored_path = tmp_path / "original.epub"
    stored_path.write_bytes(original_epub)
    checksum = hashlib.sha256(original_epub).hexdigest()

    with SessionLocal() as db:
        first_work = Work(
            title="Metadata Test Work",
            original_author="Test Author",
            description="Keep this summary.",
        )
        second_work = Work(title="Shared Tag Test Work")
        first_work.files.append(
            WorkFile(
                original_filename="original.epub",
                storage_filename="metadata-test-original.epub",
                file_format="EPUB",
                file_size=len(original_epub),
                checksum=checksum,
            )
        )
        db.add_all([first_work, second_work])
        db.commit()
        db.refresh(first_work)
        db.refresh(second_work)
        first_work_id = first_work.id
        second_work_id = second_work.id

    tag_names = {
        "Metadata Fixture Fandom A",
        "Metadata Fixture Fandom B",
        "Metadata Fixture Relationship",
        "Metadata Fixture Shared Additional Tag",
    }
    try:
        update_response = client.put(
            f"/api/works/{first_work_id}",
            json={
                "word_count": 42000,
                "chapter_count": 12,
                "rating": "Teen And Up Audiences",
                "completion_status": "In Progress",
                "published_at": "2020-05-04T00:00:00Z",
                "tags": [
                    {
                        "name": "Metadata Fixture Fandom A",
                        "tag_type": "fandom",
                    },
                    {
                        "name": "Metadata Fixture Fandom B",
                        "tag_type": "fandom",
                    },
                    {
                        "name": "Metadata Fixture Relationship",
                        "tag_type": "relationship",
                    },
                    {
                        "name": "Metadata Fixture Shared Additional Tag",
                        "tag_type": "additional",
                    },
                ],
            },
        )

        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["title"] == "Metadata Test Work"
        assert updated["description"] == "Keep this summary."
        assert updated["word_count"] == 42000
        assert updated["chapter_count"] == 12
        assert updated["rating"] == "Teen And Up Audiences"
        assert updated["completion_status"] == "In Progress"
        published_at = updated["published_at"].replace("Z", "+00:00")
        assert datetime.fromisoformat(published_at).astimezone(
            timezone.utc
        ) == datetime(2020, 5, 4, tzinfo=timezone.utc)
        assert {tag["name"] for tag in updated["tags"]} == tag_names

        shared_response = client.put(
            f"/api/works/{second_work_id}",
            json={
                "tags": [
                    {
                        "name": "Metadata Fixture Fandom A",
                        "tag_type": "fandom",
                    },
                    {
                        "name": "Metadata Fixture Shared Additional Tag",
                        "tag_type": "additional",
                    }
                ],
            },
        )
        assert shared_response.status_code == 200

        first_fandom_ids = {
            tag["id"]
            for tag in updated["tags"]
            if tag["tag_type"] == TagType.FANDOM.value
        }
        second_fandom_ids = {
            tag["id"]
            for tag in shared_response.json()["tags"]
            if tag["tag_type"] == TagType.FANDOM.value
        }
        shared_tag_name = "Metadata Fixture Shared Additional Tag"
        first_slow_burn = next(
            tag for tag in updated["tags"] if tag["name"] == shared_tag_name
        )
        second_slow_burn = next(
            tag
            for tag in shared_response.json()["tags"]
            if tag["name"] == shared_tag_name
        )
        assert first_fandom_ids.intersection(second_fandom_ids)
        assert first_slow_burn["id"] == second_slow_burn["id"]

        with SessionLocal() as db:
            file_record = db.scalar(
                select(WorkFile).where(WorkFile.work_id == first_work_id)
            )
            assert file_record is not None
            assert file_record.checksum == checksum
            assert stored_path.read_bytes() == original_epub

    finally:
        with SessionLocal() as db:
            for work_id in (first_work_id, second_work_id):
                work = db.get(Work, work_id)
                if work is not None:
                    db.delete(work)
            db.commit()

            remaining_tags = db.scalars(select(Tag).where(Tag.name.in_(tag_names))).all()
            for record in remaining_tags:
                if not record.works:
                    db.delete(record)
            db.commit()
        stored_path.unlink(missing_ok=True)
