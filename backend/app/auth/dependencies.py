from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import User
from app.auth.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise unauthorized
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError, RuntimeError):
        raise unauthorized

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise unauthorized
    return user


def require_roles(*roles: str) -> Callable:
    def role_dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return user
    return role_dependency


def enforce_api_permissions(
    request: Request,
    user: User = Depends(get_current_user),
) -> None:
    """Global baseline RBAC: viewers are read-only; settings changes are admin-only."""
    if request.method not in {"GET", "HEAD", "OPTIONS"} and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts have read-only access")
    if request.url.path.rstrip("/") == "/api/settings" and request.method != "GET" and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can change platform settings")
