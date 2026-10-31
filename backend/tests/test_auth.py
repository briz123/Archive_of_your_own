import hashlib
from typing import Optional
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.database import SessionLocal, engine
from app.main import app
from app.models import User, UserSession, Work


def register_account(
    client: TestClient, email: Optional[str] = None
) -> tuple[str, str, int, str]:
    email = email or f"auth-{uuid4().hex}@example.com"
    password = "a-secure-test-password"
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "password_confirmation": password,
        },
    )
    assert response.status_code == 201
    return (
        email,
        password,
        response.json()["user"]["id"],
        response.headers.get("set-cookie", ""),
    )


def remove_user(user_id: int) -> None:
    with engine.begin() as connection:
        connection.execute(delete(User).where(User.id == user_id))


def test_register_hashes_password_and_sets_protected_session_cookie(
    anonymous_client: TestClient,
) -> None:
    email, password, user_id, cookie_header = register_account(
        anonymous_client, "New.User@example.com"
    )

    try:
        response = anonymous_client.get("/api/auth/me")
        assert response.status_code == 200
        assert response.json()["email"] == email.lower()
        assert "password" not in response.json()
        assert "token" not in response.json()

        assert "HttpOnly" in cookie_header
        assert "SameSite=lax" in cookie_header
        session_token = anonymous_client.cookies.get("ayo_session")
        assert session_token
        assert password not in session_token

        with SessionLocal() as db:
            user = db.get(User, user_id)
            session = db.scalar(
                select(UserSession).where(
                    UserSession.token_hash
                    == hashlib.sha256(session_token.encode()).hexdigest()
                )
            )
            assert user is not None
            assert user.password_hash is not None
            assert user.password_hash != password
            assert user.password_hash.startswith("$argon2")
            assert session is not None
    finally:
        remove_user(user_id)


def test_registration_rejects_mismatched_passwords(anonymous_client: TestClient) -> None:
    response = anonymous_client.post(
        "/api/auth/register",
        json={
            "email": f"mismatch-{uuid4().hex}@example.com",
            "password": "a-secure-test-password",
            "password_confirmation": "a-different-test-password",
        },
    )

    assert response.status_code == 422
    response_text = response.text
    assert "Password confirmation does not match" in response_text
    assert "a-secure-test-password" not in response_text
    assert "input" not in response_text


def test_registration_prevents_duplicate_email_case_insensitively(
    anonymous_client: TestClient,
) -> None:
    email, _, user_id, _ = register_account(anonymous_client)
    try:
        response = anonymous_client.post(
            "/api/auth/register",
            json={
                "email": email.upper(),
                "password": "another-secure-password",
                "password_confirmation": "another-secure-password",
            },
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "An account with this email already exists."
    finally:
        remove_user(user_id)


def test_login_uses_generic_errors_and_logout_revokes_session(
    anonymous_client: TestClient,
) -> None:
    email, password, user_id, _ = register_account(anonymous_client)
    try:
        anonymous_client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": anonymous_client.cookies.get("ayo_csrf")},
        )
        assert anonymous_client.get("/api/auth/me").status_code == 401

        invalid = anonymous_client.post(
            "/api/auth/login",
            json={"email": email, "password": "incorrect-password"},
        )
        assert invalid.status_code == 401
        assert invalid.json()["detail"] == "Email or password is incorrect."

        valid = anonymous_client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        assert valid.status_code == 200
        assert anonymous_client.get("/api/auth/me").status_code == 200

        logout = anonymous_client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": anonymous_client.cookies.get("ayo_csrf")},
        )
        assert logout.status_code == 204
        assert anonymous_client.get("/api/auth/me").status_code == 401
    finally:
        remove_user(user_id)


def test_auth_endpoints_reject_untrusted_browser_origins(
    anonymous_client: TestClient,
) -> None:
    response = anonymous_client.post(
        "/api/auth/login",
        headers={"Origin": "https://attacker.example"},
        json={"email": "nobody@example.com", "password": "wrong"},
    )

    assert response.status_code == 403


def test_works_api_requires_authentication_and_csrf(anonymous_client: TestClient) -> None:
    assert anonymous_client.get("/api/works").status_code == 401
    assert anonymous_client.get("/api/works/1").status_code == 401


def test_authenticated_write_routes_reject_invalid_csrf_tokens(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/works",
        json={
            "title": "CSRF test work",
            "file": {
                "original_filename": "csrf-test.epub",
                "file_format": "EPUB",
                "file_size": 1,
                "checksum": hashlib.sha256(b"x").hexdigest(),
                "storage_provider": "local",
            },
        },
        headers={"X-CSRF-Token": "invalid"},
    )

    assert response.status_code == 403
    assert response.json()["detail"].startswith("CSRF validation failed")


def test_csrf_endpoint_returns_cookie_token_for_cross_origin_frontend(
    client: TestClient,
) -> None:
    response = client.get(
        "/api/auth/csrf",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 200
    assert response.json()["csrf_token"] == client.cookies.get("ayo_csrf")
    assert response.headers["cache-control"] == "no-store"
    assert (
        response.headers["access-control-allow-origin"] == "http://localhost:5173"
    )
    assert response.headers["access-control-allow-credentials"] == "true"


def test_csrf_endpoint_rejects_untrusted_origin(client: TestClient) -> None:
    response = client.get(
        "/api/auth/csrf",
        headers={"Origin": "https://untrusted.example"},
    )

    assert response.status_code == 403


def test_work_endpoints_only_return_records_owned_by_signed_in_user(
    client: TestClient,
    anonymous_client: TestClient,
) -> None:
    _, _, other_user_id, _ = register_account(anonymous_client)
    owner_id = client.get("/api/auth/me").json()["id"]
    with SessionLocal() as db:
        work = Work(user_id=owner_id, title="Private fixture work")
        db.add(work)
        db.commit()
        work_id = work.id

    try:
        assert anonymous_client.get("/api/works").json() == []
        assert anonymous_client.get(f"/api/works/{work_id}").status_code == 404
        assert (
            anonymous_client.put(
                f"/api/works/{work_id}",
                json={"title": "Changed by another user"},
                headers={
                    "X-CSRF-Token": anonymous_client.cookies.get("ayo_csrf")
                },
            ).status_code
            == 404
        )
        with SessionLocal() as db:
            stored_work = db.get(Work, work_id)
            assert stored_work is not None
            assert stored_work.user_id == owner_id
            assert stored_work.user_id != other_user_id
    finally:
        with SessionLocal() as db:
            work = db.get(Work, work_id)
            if work is not None:
                db.delete(work)
                db.commit()
        remove_user(other_user_id)
