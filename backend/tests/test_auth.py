import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.auth_endpoints import router as auth_router
from app.auth.dependencies import enforce_api_permissions, get_current_user
from app.auth.security import hash_password
from app.core.config import settings
from app.core.database import Base, get_db
from app.db.models import User


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SECRET_KEY", "test-only-secret-key-that-is-long-enough-123456")
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(auth_router, prefix="/api/auth")
    app.dependency_overrides[get_db] = override_get_db

    protected = APIRouter(
        dependencies=[Depends(get_current_user), Depends(enforce_api_permissions)]
    )

    @protected.get("/private")
    def read_private():
        return {"ok": True}

    @protected.post("/private")
    def write_private():
        return {"ok": True}

    app.include_router(protected, prefix="/api")

    db = TestingSession()
    db.add_all([
        User(name="Admin User", email="admin@example.com", password_hash=hash_password("admin test password 123"), role="admin", is_active=True),
        User(name="Viewer User", email="viewer@example.com", password_hash=hash_password("viewer test password 123"), role="viewer", is_active=True),
    ])
    db.commit()
    db.close()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def login(client: TestClient, email: str, password: str):
    return client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers={"origin": "http://localhost:5173"},
    )


def test_login_and_protected_api(client):
    assert client.get("/api/private").status_code == 401
    assert login(client, "admin@example.com", "wrong password").status_code == 401
    response = login(client, "admin@example.com", "admin test password 123")
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
    assert "iotshield_refresh" in response.cookies
    token = response.json()["access_token"]
    assert client.get("/api/private", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_refresh_rotation_and_reuse_detection(client):
    first = login(client, "admin@example.com", "admin test password 123")
    old_refresh = first.cookies.get("iotshield_refresh")
    rotated = client.post("/api/auth/refresh", headers={"origin": "http://localhost:5173"})
    assert rotated.status_code == 200
    new_refresh = rotated.cookies.get("iotshield_refresh")
    assert new_refresh and new_refresh != old_refresh

    replay = client.post(
        "/api/auth/refresh",
        headers={"origin": "http://localhost:5173"},
        cookies={"iotshield_refresh": old_refresh},
    )
    assert replay.status_code == 401

    after_replay = client.post(
        "/api/auth/refresh",
        headers={"origin": "http://localhost:5173"},
        cookies={"iotshield_refresh": new_refresh},
    )
    assert after_replay.status_code == 401


def test_viewer_is_read_only(client):
    response = login(client, "viewer@example.com", "viewer test password 123")
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/private", headers=headers).status_code == 200
    assert client.post("/api/private", headers=headers).status_code == 403


def test_logout_revokes_refresh_session(client):
    response = login(client, "admin@example.com", "admin test password 123")
    assert response.status_code == 200
    logout = client.post("/api/auth/logout", headers={"origin": "http://localhost:5173"})
    assert logout.status_code == 204
    refresh = client.post("/api/auth/refresh", headers={"origin": "http://localhost:5173"})
    assert refresh.status_code == 401


def test_admin_can_provision_users_but_viewer_cannot(client):
    admin = login(client, "admin@example.com", "admin test password 123")
    admin_headers = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    created = client.post(
        "/api/auth/users",
        headers=admin_headers,
        json={"name": "Analyst Bob", "email": "analyst@example.com", "password": "a sufficiently strong password", "role": "analyst"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["role"] == "analyst"
    assert created.json()["name"] == "Analyst Bob"

    viewer = login(client, "viewer@example.com", "viewer test password 123")
    viewer_headers = {"Authorization": f"Bearer {viewer.json()['access_token']}"}
    denied = client.post(
        "/api/auth/users",
        headers=viewer_headers,
        json={"email": "another@example.com", "password": "a sufficiently strong password", "role": "analyst"},
    )
    assert denied.status_code == 403


def test_registration_and_immediate_login(client):
    payload = {
        "name": "Jane Doe",
        "email": "jane@example.com",
        "password": "securepassword123",
        "role": "admin",  # Attacker attempts privilege escalation
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Jane Doe"
    assert data["email"] == "jane@example.com"
    # Verify viewer role is enforced and user cannot choose or modify role
    assert data["role"] == "viewer"
    assert data["is_active"] is True

    # Immediate login works with new credentials
    login_res = login(client, "jane@example.com", "securepassword123")
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    assert login_res.json()["user"]["role"] == "viewer"

    # Viewer can access read route but cannot write
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/private", headers=headers).status_code == 200
    assert client.post("/api/private", headers=headers).status_code == 403


def test_registration_duplicate_email_rejected(client):
    payload = {
        "name": "Original User",
        "email": "unique@example.com",
        "password": "securepassword123",
    }
    first = client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    # Exact duplicate
    duplicate = client.post("/api/auth/register", json=payload)
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.json()["detail"]

    # Case-insensitive duplicate
    upper_payload = {
        "name": "Original User",
        "email": "UNIQUE@EXAMPLE.COM",
        "password": "differentpassword123",
    }
    case_dup = client.post("/api/auth/register", json=upper_payload)
    assert case_dup.status_code == 409


def test_registration_validation(client):
    # Invalid email
    bad_email = client.post(
        "/api/auth/register",
        json={"name": "Bad Email", "email": "invalid-email-format", "password": "securepassword123"},
    )
    assert bad_email.status_code in {422, 400}

    # Empty name
    empty_name = client.post(
        "/api/auth/register",
        json={"name": "   ", "email": "valid@example.com", "password": "securepassword123"},
    )
    assert empty_name.status_code in {422, 400}

    # Password too short (< 8)
    short_pw = client.post(
        "/api/auth/register",
        json={"name": "Short Pass", "email": "valid2@example.com", "password": "short"},
    )
    assert short_pw.status_code in {422, 400}


def test_password_change_and_session_invalidation(client):
    # Sign in as viewer
    first_login = login(client, "viewer@example.com", "viewer test password 123")
    assert first_login.status_code == 200
    token = first_login.json()["access_token"]
    old_cookie = first_login.cookies.get("iotshield_refresh")

    # Change password
    headers = {"Authorization": f"Bearer {token}"}
    change_res = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "viewer test password 123",
            "new_password": "a newly updated secure password 123",
        },
    )
    assert change_res.status_code == 204

    # Old refresh cookie must be invalidated
    refresh_attempt = client.post(
        "/api/auth/refresh",
        headers={"origin": "http://localhost:5173"},
        cookies={"iotshield_refresh": old_cookie},
    )
    assert refresh_attempt.status_code == 401

    # Old password no longer works
    old_login = login(client, "viewer@example.com", "viewer test password 123")
    assert old_login.status_code == 401

    # New password works
    new_login = login(client, "viewer@example.com", "a newly updated secure password 123")
    assert new_login.status_code == 200


def test_unauthorized_and_invalid_tokens(client):
    # Missing token
    assert client.get("/api/private").status_code == 401

    # Malformed token
    assert client.get("/api/private", headers={"Authorization": "Bearer not-a-valid-jwt"}).status_code == 401

    # GET /api/auth/me without auth
    assert client.get("/api/auth/me").status_code == 401
