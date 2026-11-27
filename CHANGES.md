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
