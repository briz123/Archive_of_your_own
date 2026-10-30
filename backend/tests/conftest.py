from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database import engine
from app.main import app
from app.models import User


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.post(
            "/api/auth/register",
            json={
                "email": f"test-{uuid4().hex}@example.com",
                "password": "test-password-long-enough",
                "password_confirmation": "test-password-long-enough",
            },
        )
        assert response.status_code == 201
        user_id = response.json()["user"]["id"]
        test_client.headers["X-CSRF-Token"] = test_client.cookies.get("ayo_csrf")
        yield test_client

        with engine.begin() as connection:
            connection.execute(delete(User).where(User.id == user_id))


@pytest.fixture
def anonymous_client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
