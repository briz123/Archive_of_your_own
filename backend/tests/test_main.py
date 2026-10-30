from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Work

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
