# Pre-deployment fixes

Small, targeted fixes made before deploying. Each entry lists the problem, the exact change, and how it was verified.

---

## 1. Remove Windows-only package from frontend dependencies

**Problem**
`frontend/package.json` listed `@rolldown/binding-win32-x64-msvc` as a direct dependency. This package is a native binary that only installs on Windows (`os: win32`, `cpu: x64`). On Linux or macOS, which includes every common hosting platform (Vercel, Netlify, Render, Docker), `npm ci` stops with:

```
npm error code EBADPLATFORM
npm error notsup Unsupported platform for @rolldown/binding-win32-x64-msvc
```

so the frontend cannot be installed or built there.

**Change**
- `frontend/package.json`: removed the `"@rolldown/binding-win32-x64-msvc"` line from `dependencies`.
- `frontend/package-lock.json`: regenerated with `npm uninstall @rolldown/binding-win32-x64-msvc`.

Windows still works. `rolldown` (used by Vite) lists this binding as an *optional* dependency of its own, so npm still installs it automatically on Windows and skips it everywhere else. It remains in the lockfile under that entry.

**Verified**
- On Linux: `npm ci` succeeds and `npm run build` completes (`✓ built`).
- No source code changed.

---

## 2. Strip directory parts from uploaded file names (path traversal)

**Problem**
Both upload endpoints built the save path straight from the name the client sent:

- `POST /api/dataset/upload` in `backend/app/api/endpoints.py`
- `POST /api/capture/upload` in `backend/app/api/capture_endpoints.py`

```python
file_uuid = f"{timestamp}_{file.filename}"
filepath = os.path.join(settings.UPLOAD_DIR, file_uuid)
```

`file.filename` is whatever the client puts there, so a name like `x/../../../app/main.py.csv` produces a path that leaves `uploads/`. On Windows the path is resolved by text alone, so this works even when the intermediate folders don't exist. Anyone who can reach the API could then write files outside the upload folder.

**Change**
In both endpoints, the file name is now reduced to its last part before it goes into the path:

```python
safe_name = os.path.basename(file.filename)  # strip any directory parts to prevent path traversal
file_uuid = f"{timestamp}_{safe_name}"
```

Nothing else changed. The `.csv` / `.pcap` / `.pcapng` extension checks still run first, and the original name is still stored as the dataset's display name.

**Verified**
- Both files compile (`python -m py_compile`).
- Not yet tested against a running backend. Expected: normal uploads still save to `backend/uploads/` as `<timestamp>_<name>`, and a crafted name like `a/../../evil.pcap` is saved inside `backend/uploads/` as `<timestamp>_evil.pcap`.
