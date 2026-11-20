# IoT Shield authentication setup

This patch replaces the simulated React login with FastAPI-backed authentication. It reuses the application's existing SQLAlchemy database URL and adds only `users` and `refresh_sessions` tables. Existing datasets, models, reports, MongoDB and ChromaDB data are not migrated or deleted.

## 1. Apply the patch

Extract `iotshield_auth_patch.zip` into the repository root and allow it to overwrite the listed source files. Do not delete your existing `.env`, SQLite database, ChromaDB files, or other local changes.

## 2. Configure the signing secret

From the repository root, generate a strong secret:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Create or edit the repository-root `.env` file and add the generated value:

```dotenv
AUTH_SECRET_KEY=PASTE_THE_GENERATED_VALUE_HERE
AUTH_ACCESS_TOKEN_MINUTES=15
AUTH_REFRESH_TOKEN_HOURS=8
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
AUTH_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Do not commit `.env` or share the signing secret. Keep the existing `DATABASE_URL` unchanged unless your team has separately configured a production database.

For HTTPS production, set `AUTH_COOKIE_SECURE=true` and replace `AUTH_ALLOWED_ORIGINS` with the exact deployed frontend origins.

## 3. Install the two authentication dependencies

From the repository root, with the backend virtual environment activated:

```powershell
python -m pip install "argon2-cffi>=23.1.0" "PyJWT>=2.8.0"
```

Or install the full backend requirements if needed:

```powershell
python -m pip install -r backend/requirements.txt
```

## 4. Create the first administrator

Open a terminal and run:

```powershell
cd backend
.venv\Scripts\python.exe -m app.auth.create_admin
```

Enter the admin email and a password of at least 12 characters when prompted. The password is hashed with Argon2id. There is no hardcoded default account and no public registration route.

## 5. Start the application

Backend (from repository root):

```powershell
python -m uvicorn app.main:app --reload --app-dir backend
```

Frontend (second terminal):

```powershell
cd frontend
npm run dev
```

Open the Vite URL. Sign in with the admin credentials created in step 4.

## 6. Authentication behavior

- `POST /api/auth/login`: verifies email/password and issues a 15-minute access JWT.
- Refresh token: random opaque token in an HttpOnly cookie; only its SHA-256 hash is stored in SQLAlchemy.
- `POST /api/auth/refresh`: rotates refresh tokens; reuse of a rotated token revokes that token family.
- `POST /api/auth/logout`: revokes the current refresh session.
- `POST /api/auth/logout-all`: revokes all refresh sessions for the authenticated user.
- `GET /api/auth/me`: returns the authenticated user.
- `POST /api/auth/change-password`: changes password and revokes refresh sessions.
- `POST /api/auth/users`: admin-only account provisioning for `admin`, `analyst`, or `viewer`.
- Existing `/api/*` application routes require a valid bearer access token. Viewer accounts are read-only; only admins can change platform settings.

The access token is kept in React memory, not localStorage. On page reload the frontend attempts a refresh using the HttpOnly cookie. Existing application API calls share one authenticated fetch wrapper and automatically attempt one refresh after a 401.

## 7. Tests

From the repository root, with the backend virtual environment active:

```powershell
python -m pip install pytest
$env:PYTHONPATH = "backend"
python -m pytest backend/tests/test_auth.py -q
```

The tests cover invalid and valid login, protected routes, refresh rotation, refresh-token replay detection, viewer read-only behavior, and logout.

## Notes

- The existing SQLite database is retained. SQLAlchemy `create_all` creates the two new tables on backend startup; it does not drop existing tables or data.
- This patch does not implement OAuth/social login, email-based password reset, MFA, or account self-registration. The visible fake social-login controls have been removed rather than left misleadingly clickable.
- Existing non-authentication business logic and storage services are intentionally unchanged.
