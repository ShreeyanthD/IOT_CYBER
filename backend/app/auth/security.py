import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

_password_hasher = PasswordHasher()
ALGORITHM = "HS256"


def _secret_key() -> str:
    key = settings.AUTH_SECRET_KEY
    if not key or len(key.encode("utf-8")) < 32:
        raise RuntimeError(
            "AUTH_SECRET_KEY must be set to a random value of at least 32 bytes. "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    return key


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.AUTH_ACCESS_TOKEN_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": now,
        "exp": expires,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, _secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
    if payload.get("type") != "access" or not payload.get("sub"):
        raise jwt.InvalidTokenError("Invalid access token")
    return payload


def utcnow_naive() -> datetime:
    """Return UTC as a naive datetime for compatibility with SQLite DateTime."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
