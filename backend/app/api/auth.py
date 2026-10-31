import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_SAMESITE,
    SESSION_COOKIE_SECURE,
    SESSION_MAX_AGE_SECONDS,
    TRUSTED_FRONTEND_ORIGINS,
)
from app.database import get_db
from app.models import User, UserSession

router = APIRouter(prefix="/api/auth", tags=["authentication"])
password_hasher = PasswordHasher()
_dummy_password_hash = password_hasher.hash(secrets.token_urlsafe(32))


class RegistrationRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    password_confirmation: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @model_validator(mode="after")
    def passwords_match(self) -> "RegistrationRequest":
        if self.password != self.password_confirmation:
            raise ValueError("Password confirmation does not match.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class AuthUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    status: str
    created_at: datetime


class AuthResponse(BaseModel):
    user: AuthUserRead


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verify_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in TRUSTED_FRONTEND_ORIGINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This request origin is not allowed.",
        )


def _set_session_cookies(
    response: Response, session_token: str, csrf_token: str
) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=False,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        httponly=False,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path="/",
    )


def _create_session(db: Session, user: User, response: Response) -> None:
    session_token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            token_hash=_token_hash(session_token),
            csrf_token_hash=_token_hash(csrf_token),
            user=user,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=SESSION_MAX_AGE_SECONDS),
        )
    )
    _set_session_cookies(response, session_token, csrf_token)


def _revoke_presented_session(db: Session, request: Request) -> None:
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if session_token:
        existing_session = db.get(UserSession, _token_hash(session_token))
        if existing_session is not None:
            db.delete(existing_session)


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )

    user_session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(UserSession.token_hash == _token_hash(session_token))
    )
    now = datetime.now(timezone.utc)
    if user_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or has expired. Please sign in again.",
        )
    if user_session.expires_at <= now or user_session.user.status != "active":
        db.delete(user_session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or has expired. Please sign in again.",
        )

    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME, "")
        csrf_header = request.headers.get("x-csrf-token", "")
        if (
            not csrf_cookie
            or not csrf_header
            or not secrets.compare_digest(csrf_cookie, csrf_header)
            or not secrets.compare_digest(
                _token_hash(csrf_cookie), user_session.csrf_token_hash
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF validation failed. Refresh the page and try again.",
            )

    return user_session.user


CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    body: RegistrationRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    _verify_trusted_origin(request)
    existing_user = db.scalar(
        select(User.id).where(func.lower(User.email) == body.email)
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=body.email,
        password_hash=password_hasher.hash(body.password),
    )
    db.add(user)
    try:
        db.flush()
        _revoke_presented_session(db, request)
        _create_session(db, user, response)
        db.commit()
        db.refresh(user)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from error

    return AuthResponse(user=AuthUserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    _verify_trusted_origin(request)
    user = db.scalar(
        select(User).where(func.lower(User.email) == body.email)
    )
    stored_hash = (
        user.password_hash
        if user is not None and user.password_hash is not None
        else _dummy_password_hash
    )
    try:
        password_matches = password_hasher.verify(stored_hash, body.password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        password_matches = False

    if user is None or user.status != "active" or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    if password_hasher.check_needs_rehash(stored_hash):
        user.password_hash = password_hasher.hash(body.password)
    _revoke_presented_session(db, request)
    _create_session(db, user, response)
    db.commit()
    return AuthResponse(user=AuthUserRead.model_validate(user))


@router.get("/me", response_model=AuthUserRead)
def get_me(user: CurrentUser) -> User:
    return user


@router.get("/csrf")
def get_csrf_token(
    request: Request,
    response: Response,
    user: CurrentUser,
) -> dict[str, str]:
    _verify_trusted_origin(request)
    csrf_token = request.cookies.get(CSRF_COOKIE_NAME)
    if not csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token is unavailable. Please sign in again.",
        )
    response.headers["Cache-Control"] = "no-store"
    return {"csrf_token": csrf_token}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if session_token:
        user_session = db.get(UserSession, _token_hash(session_token))
        if user_session is not None and user_session.user_id == user.id:
            db.delete(user_session)
            db.commit()
    _clear_session_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
