import secrets
from datetime import timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_roles

from app.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserCreateRequest,
    UserResponse,
)

from app.auth.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    utcnow_naive,
    verify_password,
)

from app.core.config import settings
from app.core.database import get_db
from app.db.models import RefreshSession, User

router = APIRouter(tags=["Authentication"])


def _cookie_options() -> dict:
    return {
        "key": "iotshield_refresh",
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "path": "/api/auth",
        "max_age": settings.AUTH_REFRESH_TOKEN_HOURS * 60 * 60,
    }


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(value=token, **_cookie_options())


def _clear_refresh_cookie(response: Response) -> None:
    options = _cookie_options()
    options.pop("max_age", None)
    response.delete_cookie(**options)


def _validate_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    allowed = settings.allowed_auth_origins
    if not origin or origin not in allowed:
        raise HTTPException(status_code=403, detail="Invalid request origin")


def _issue_tokens(
    user: User,
    response: Response,
    db: Session,
    family_id: str | None = None,
    family_expires_at=None,
) -> TokenResponse:
    raw_refresh = new_refresh_token()
    now = utcnow_naive()
    session = RefreshSession(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        family_id=family_id or secrets.token_urlsafe(24),
        expires_at=family_expires_at or now + timedelta(hours=settings.AUTH_REFRESH_TOKEN_HOURS),
        created_at=now,
        last_used_at=now,
    )
    db.add(session)
    db.commit()
    _set_refresh_cookie(response, raw_refresh)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        expires_in=settings.AUTH_ACCESS_TOKEN_MINUTES * 60,
        user=user,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _issue_tokens(user, response, db)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    _validate_origin(request)
    raw_token = request.cookies.get("iotshield_refresh")
    if not raw_token:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh session missing or expired")

    token_hash = hash_refresh_token(raw_token)
    session = (
        db.query(RefreshSession)
        .filter(RefreshSession.token_hash == token_hash)
        .with_for_update()
        .first()
    )
    if not session:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh session is invalid")

    now = utcnow_naive()
    if session.revoked_at is not None:
        # A previously rotated token was replayed: revoke every session in its family.
        db.query(RefreshSession).filter(
            RefreshSession.family_id == session.family_id,
            RefreshSession.revoked_at.is_(None),
        ).update({RefreshSession.revoked_at: now}, synchronize_session=False)
        db.commit()
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh token reuse detected; sign in again")

    if session.expires_at <= now:
        session.revoked_at = now
        db.commit()
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh session expired")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.is_active:
        session.revoked_at = now
        db.commit()
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Account is unavailable")

    family_id = session.family_id
    family_expires_at = session.expires_at
    session.revoked_at = now
    session.last_used_at = now
    db.commit()
    # Keep the original family expiry: rotation does not extend the 8-hour absolute session.
    return _issue_tokens(user, response, db, family_id=family_id, family_expires_at=family_expires_at)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    _validate_origin(request)
    raw_token = request.cookies.get("iotshield_refresh")
    if raw_token:
        session = db.query(RefreshSession).filter(
            RefreshSession.token_hash == hash_refresh_token(raw_token),
            RefreshSession.revoked_at.is_(None),
        ).first()
        if session:
            session.revoked_at = utcnow_naive()
            db.commit()
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/logout-all", status_code=204)
def logout_all(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None),
    ).update({RefreshSession.revoked_at: utcnow_naive()}, synchronize_session=False)
    db.commit()
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None),
    ).update({RefreshSession.revoked_at: utcnow_naive()}, synchronize_session=False)
    db.commit()
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(status_code=422, detail="A valid email address is required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    new_user = User(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        role="viewer",
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(
    payload: UserCreateRequest,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(status_code=422, detail="A valid email address is required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    name = payload.name.strip() if payload.name else email.split("@")[0].title()
    new_user = User(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/users", response_model=list[UserResponse])
def list_users(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.id.asc()).all()
