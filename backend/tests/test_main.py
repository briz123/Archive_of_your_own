import hashlib
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.models import (
    ArchiveWarning,
    ArchiveWarningType,
    Tag,
    TagType,
    Work,
    WorkFile,
)


def test_health_check(client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "message": "Connected to the AYO backend.",
    }


def test_work_can_be_inserted_and_retrieved(client) -> None:
    user_id = client.get("/api/auth/me").json()["id"]
    with SessionLocal() as db:
        work = Work(
            user_id=user_id,
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


def test_local_import_saves_metadata_without_storing_the_file(client) -> None:
    checksum = hashlib.sha256(b"original file stays in browser").hexdigest()
    response = client.post(
        "/api/works",
        json={
            "title": "Imported from EPUB",
            "original_author": "Test Author",
            "description": "A locally extracted description.",
            "language": "en",
            "publisher": "Local Publisher",
            "identifier": "urn:test:work-1",
            "subject": "Test Fandom; Test Relationship",
            "creator": "PDF Creator",
            "producer": "PDF Producer",
            "publication_date": "2021",
            "creation_date": "D:20210101000000Z",
            "modification_date": "D:20220101000000Z",
            "rating": "Teen And Up Audiences",
            "category": "F/F",
            "tags": [
                {"name": "Test Fandom", "tag_type": "fandom"},
                {"name": "Test Relationship", "tag_type": "relationship"},
            ],
            "warnings": ["Major Character Death"],
            "file": {
                "original_filename": "My Daughters Eccentricity Rivals No One.epub.zip",
                "file_format": "EPUB",
                "file_size": 1024,
                "checksum": checksum,
                "storage_provider": "local",
            },
        },
    )

    assert response.status_code == 201
    work = response.json()
    assert work["title"] == "Imported from EPUB"
    assert work["publisher"] == "Local Publisher"
    assert work["identifier"] == "urn:test:work-1"
    assert work["publication_date"] == "2021"
    assert work["published_at"] is None
    assert {tag["name"] for tag in work["tags"]} == {
        "Test Fandom",
        "Test Relationship",
    }
    assert work["warnings"] == ["Major Character Death"]
    assert len(work["files"]) == 1
    file_record = work["files"][0]
    assert (
        file_record["original_filename"]
        == "My Daughters Eccentricity Rivals No One.epub.zip"
    )
    assert file_record["file_format"] == "EPUB"
    assert file_record["file_size"] == 1024
    assert file_record["checksum"] == checksum
    assert file_record["storage_provider"] == "local"
    assert file_record["status"] == "cataloged"

    with SessionLocal() as db:
        stored_file = db.get(WorkFile, file_record["id"])
        assert stored_file is not None
        assert stored_file.storage_filename is None

    download = client.get(f"/api/works/{work['id']}/download")
    assert download.status_code == 404


def test_canonical_epub_fingerprint_prevents_duplicate_imports(client) -> None:
    checksum = hashlib.sha256(b"canonical epub contents").hexdigest()
    payload = {
        "title": "Canonical EPUB",
        "file": {
            "original_filename": "Canonical.epub",
            "file_format": "EPUB",
            "file_size": 1024,
            "checksum": checksum,
            "fingerprint_version": 2,
            "storage_provider": "local",
        },
    }

    first_response = client.post("/api/works", json=payload)
    assert first_response.status_code == 201
    work_id = first_response.json()["id"]

    second_payload = {
        **payload,
        "file": {**payload["file"], "original_filename": "Unpacked.epub"},
    }
    try:
        second_response = client.post("/api/works", json=second_payload)
        assert second_response.status_code == 409
        assert second_response.json()["detail"] == "This book is already in your library."
    finally:
        with SessionLocal() as db:
            test_work = db.get(Work, work_id)
            if test_work is not None:
                db.delete(test_work)
                db.commit()


def test_works_search_matches_title_and_author_case_insensitively(client) -> None:
    user_id = client.get("/api/auth/me").json()["id"]
    with SessionLocal() as db:
        work = Work(
            user_id=user_id,
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


def test_works_search_returns_empty_list_when_nothing_matches(client) -> None:
    response = client.get(
        "/api/works",
        params={"search": "no-work-should-have-this-search-term"},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_works_filter_by_any_selected_fandom(client) -> None:
    user_id = client.get("/api/auth/me").json()["id"]
    fandom_names = {
        "Basic Search Fixture Fandom One",
        "Basic Search Fixture Fandom Two",
        "Basic Search Fixture Fandom Three",
    }

    with SessionLocal() as db:
        fandoms = [
            Tag(user_id=user_id, name=name, tag_type=TagType.FANDOM)
            for name in sorted(fandom_names)
        ]
        works = [
            Work(
                user_id=user_id,
                title=f"Basic Search Fixture Work {index}",
                tags=[fandom],
            )
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
            tags = db.scalars(
                select(Tag).where(
                    Tag.user_id == user_id,
                    Tag.name.in_(fandom_names),
                )
            ).all()
            for tag in tags:
                if not tag.works:
                    db.delete(tag)
            db.commit()


def test_advanced_search_filters_and_options_match_user_tags(
    client, monkeypatch
) -> None:
    from app.api import works as works_api

    monkeypatch.setattr(works_api, "ADVANCED_SEARCH_ENABLED", True)
    user_id = client.get("/api/auth/me").json()["id"]
    tag_names = {
        "Advanced Fixture Fandom",
        "Advanced Fixture Pairing",
        "Advanced Fixture Additional",
    }

    with SessionLocal() as db:
        fandom = Tag(
            user_id=user_id,
            name="Advanced Fixture Fandom",
            tag_type=TagType.FANDOM,
        )
        pairing = Tag(
            user_id=user_id,
            name="Advanced Fixture Pairing",
            tag_type=TagType.RELATIONSHIP,
        )
        additional = Tag(
            user_id=user_id,
            name="Advanced Fixture Additional",
            tag_type=TagType.ADDITIONAL,
        )
        warning = db.query(ArchiveWarning).filter(
            ArchiveWarning.name == ArchiveWarningType.MAJOR_CHARACTER_DEATH
        ).one()
        matching_work = Work(
            user_id=user_id,
            title="Unrelated title",
            tags=[fandom, pairing, additional],
            warnings=[warning],
        )
        other_work = Work(
            user_id=user_id,
            title="Another work",
            tags=[fandom],
        )
        db.add_all([matching_work, other_work])
        db.commit()
        matching_id = matching_work.id
        other_id = other_work.id
        fandom_id = fandom.id
        pairing_id = pairing.id
        additional_id = additional.id

    try:
        filtered = client.get(
            "/api/works",
            params=[
                ("fandom_id", fandom_id),
                ("relationship_id", pairing_id),
                ("additional_tag_id", additional_id),
                ("warning", ArchiveWarningType.MAJOR_CHARACTER_DEATH.value),
            ],
        )
        assert filtered.status_code == 200
        assert [work["id"] for work in filtered.json()] == [matching_id]

        searched = client.get("/api/works", params={"search": "Advanced Fixture Pairing"})
        assert searched.status_code == 200
        assert [work["id"] for work in searched.json()] == [matching_id]

        across_groups = client.get(
            "/api/works",
            params=[
                ("relationship_id", pairing_id),
                ("additional_tag_id", additional_id),
            ],
        )
        assert across_groups.status_code == 200
        assert [work["id"] for work in across_groups.json()] == [matching_id]

        excluded = client.get(
            "/api/works",
            params=[("exclude_tag_id", additional_id)],
        )
        assert excluded.status_code == 200
        assert [work["id"] for work in excluded.json()] == [other_id]

        options = client.get("/api/works/filters")
        assert options.status_code == 200
        payload = options.json()
        assert payload["advanced_search_enabled"] is True
        assert any(
            tag["name"] == "Advanced Fixture Pairing"
            and tag["tag_type"] == "relationship"
            for tag in payload["tags"]
        )
        assert ArchiveWarningType.MAJOR_CHARACTER_DEATH.value in payload["warnings"]
        assert any(
            fandom_option["id"] == fandom_id
            for fandom_option in payload["fandoms"]
        )
    finally:
        with SessionLocal() as db:
            for work_id in (matching_id, other_id):
                work = db.get(Work, work_id)
                if work is not None:
                    db.delete(work)
            db.commit()
            tags = db.query(Tag).filter(
                Tag.user_id == user_id,
                Tag.name.in_(tag_names),
            ).all()
            for tag in tags:
                if not tag.works:
                    db.delete(tag)
            db.commit()


def test_work_metadata_update_rejects_null_title(client) -> None:
    response = client.put("/api/works/1", json={"title": None})

    assert response.status_code == 422


def test_work_metadata_can_be_edited_and_taxonomy_is_shared(
    client,
    tmp_path: Path,
) -> None:
    user_id = client.get("/api/auth/me").json()["id"]
    original_epub = b"unchanged original EPUB bytes"
    stored_path = tmp_path / "original.epub"
    stored_path.write_bytes(original_epub)
    checksum = hashlib.sha256(original_epub).hexdigest()

    with SessionLocal() as db:
        first_work = Work(
            user_id=user_id,
            title="Metadata Test Work",
            original_author="Test Author",
            description="Keep this summary.",
        )
        second_work = Work(user_id=user_id, title="Shared Tag Test Work")
        first_work.files.append(
            WorkFile(
                original_filename="original.epub",
                storage_filename="metadata-test-original.epub",
                file_format="EPUB",
                file_size=len(original_epub),
                checksum=checksum,
                storage_provider="legacy_server",
                status="stored",
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

            remaining_tags = db.scalars(
                select(Tag).where(
                    Tag.user_id == user_id,
                    Tag.name.in_(tag_names),
                )
            ).all()
            for record in remaining_tags:
                if not record.works:
                    db.delete(record)
            db.commit()
        stored_path.unlink(missing_ok=True)
