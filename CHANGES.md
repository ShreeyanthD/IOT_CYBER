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
- Tested on a running backend (Windows):
  - A normal upload of `sample_pcaps/ddos_syn_flood.pcap` returned 201 and was saved as `backend/uploads/upload_<timestamp>_ddos_syn_flood.pcap`.
  - `curl -F "file=@sample_pcaps/ddos_syn_flood.pcap;filename=a/../../evil.pcap" .../api/capture/upload` was saved inside `backend/uploads/` as `upload_<timestamp>_evil.pcap`. Nothing was written outside the folder.

---

## 3. Make allowed CORS origins configurable instead of `*`

**Problem**
`backend/app/main.py` allowed every origin while also allowing credentials:

```python
allow_origins=["*"],
allow_credentials=True,
```

That's fine on localhost. Once the API is public, though, any website a user visits can call it from their browser. There was also no way to name the deployed frontend's address without editing code.

**Change**
- `backend/app/main.py`: allowed origins are now read from the `CORS_ORIGINS` environment variable, a comma-separated list. If it isn't set, it defaults to the local Vite dev server (`http://localhost:5173,http://127.0.0.1:5173`), so local development works with no setup. Also added the `import os` it needs.
- `backend/.env.example`: added `CORS_ORIGINS` with an example value.

In production, set it to the deployed frontend, e.g. `CORS_ORIGINS=https://your-frontend.vercel.app`.

Local dev through `npm run dev` is unaffected either way: Vite proxies `/api` to the backend, so the browser sees same-origin requests.

**Verified**
- `main.py` compiles.
- Same middleware config tested with FastAPI's TestClient:
  - `Origin: http://localhost:5173` is allowed.
  - `Origin: https://evil.com` gets no `Access-Control-Allow-Origin` header, so the browser blocks it.
  - With `CORS_ORIGINS=https://app.vercel.app`, that origin is allowed.
- Tested on the running backend (Windows): `curl -i -H "Origin: http://localhost:5173" http://127.0.0.1:8000/` returns `access-control-allow-origin: http://localhost:5173`, and `Origin: https://evil.com` gets no such header. The frontend (`npm run dev`) loads all pages normally.

---

## 4. Stop tracking generated / local-only files (~110 MB)

**Problem**
Two sets of files that aren't source code were committed:

| Path | Size | What it is |
|---|---|---|
| `backend/data/models/` (30 files) | ~88 MB | Hugging Face cache of the `all-MiniLM-L6-v2` embedding model. `app/rag/embeddings.py` downloads it here automatically on first use. |
| `backend/uploads/*.pcap` (35 files) | ~21 MB | Packet captures from local test runs. `.gitignore` already excluded these, but they were committed before that rule was added, so git kept tracking them. |

They make every clone ~110 MB larger and slower, which also slows down deployment builds.

**Change**
- `.gitignore`: added `backend/data/models/`.
- `git rm -r --cached backend/data/models 'backend/uploads/*.pcap'`: removes them from the repository only. **The files are not deleted from disk** on any existing checkout.

**Kept on purpose** (they look like generated files, but the app needs them and does not rebuild them on its own):
- `backend/iot_sentinel.db`: contains the 4 registered ML models (`ml_models` table) that the detection engine uses. Nothing re-seeds them at startup.
- `backend/data/chroma_db/` and `backend/data/rag_cache/`: the RAG vector index and source feeds. These are only rebuilt by calling the RAG refresh endpoint by hand.
- `backend/uploads/20260825155318_iot_ids_classification_test.csv`: referenced by the one row in the `datasets` table.
- `sample_pcaps/`: sample attack captures meant for demos.

**Verified**
- After the change, all 35 pcaps and the model cache are still present on disk.
- On a fresh clone the embedding model is downloaded again automatically on first RAG use (this needs internet access).
- Note: this does not shrink the existing git *history* (`.git` stays ~130 MB). It keeps the files out of new commits and makes the working tree lighter.

---

## 5. Fix backend crash on startup with current FastAPI (`Query(enum=...)`)

**Problem**
On a fresh install the backend fails to start:

```
File "backend/app/api/report_endpoints.py", line 91
    def download_stored_report_file(report_id: str, format: Optional[str] = Query("md", enum=["md", "json"])):
TypeError: Query() got an unexpected keyword argument 'enum'
```

`requirements.txt` pins only `fastapi>=0.100.0`, so a fresh install gets the newest release (0.165.0 at the time of writing). Older FastAPI versions accepted unknown keyword arguments in `Query()` and put them in the OpenAPI schema. Newer versions reject them, so `enum=` crashes the whole app at import time. Any new environment, including deployment, hits this.

**Change**
`backend/app/api/report_endpoints.py`:

```python
# before
format: Optional[str] = Query("md", enum=["md", "json"])
# after
format: Literal["md", "json"] = Query("md")
```

Also added `Literal` to the `typing` import. This is the supported way to restrict a parameter to fixed values. FastAPI validates it and still shows the two choices as a dropdown in `/docs`. It was the only `enum=` use in the codebase.

**Verified**
- File compiles.
- Same endpoint signature tested with FastAPI 0.165.0 and TestClient:
  - no `format` gives `md`
  - `?format=json` gives `json`
  - `?format=exe` is rejected with HTTP 422

---

## 6. Add Groq as an LLM provider

**Why**
The backend defaults to Ollama, which runs on the local machine and isn't available on a hosted deployment. Groq offers free API keys and an OpenAI-compatible API, so it's an easy hosted option. The OpenAI client in `backend/app/llm/client.py`, however, had `https://api.openai.com` hardcoded, so it couldn't be pointed at Groq.

**Change** (`backend/app/llm/client.py`)
- New provider `groq`, selected with `LLM_PROVIDER=groq`, key read from `GROQ_API_KEY`.
- `_call_openai()` now takes optional `base_url`, `key_name` and `provider_label` arguments. The defaults are OpenAI's values, so existing `openai` behaviour is unchanged. The `groq` provider calls it with `base_url="https://api.groq.com/openai/v1"`, so no request code is duplicated.
- Default Groq model: `openai/gpt-oss-120b`. Override it with `LLM_MODEL`. (`llama-3.3-70b-versatile` was tried first, but Groq now limits it to Enterprise accounts and free keys get `model_not_found`.)
- Related fix in `get_llm_client()`: if `LLM_MODEL` wasn't set, the model name was always taken from `platform_settings.json`, even when that file is configured for a different provider. With the committed settings (`provider: ollama`, `model: llama3.2`), setting `LLM_PROVIDER=groq` (or `gemini`/`openai`) would send the Ollama model name `llama3.2` to that provider. Now the settings-file model is used only when its provider matches; otherwise the provider's default model is used.

- Related fix in `LLMClient.__init__`: an empty `LLM_MODEL=` line in `.env` set the model to `""`, because `os.environ.get("LLM_MODEL", default)` returns the empty string rather than the default. The provider then rejected it (Groq: `HTTP 404 model_not_found: The model `` does not exist`). An empty or blank `LLM_MODEL` now falls back to the provider's default model.

`backend/.env.example`: added `groq` to the provider list and a `GROQ_API_KEY=` line.

**How to use**
```
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...        # free key from https://console.groq.com
# LLM_MODEL=                # optional, defaults to openai/gpt-oss-120b
```

**Verified** (HTTP call mocked, no real key):
- `LLM_PROVIDER=groq`, no `LLM_MODEL`: the client reports `groq / openai/gpt-oss-120b` and is available.
- A request goes to `https://api.groq.com/openai/v1/chat/completions` with `Bearer <GROQ_API_KEY>`. JSON mode (`response_format: json_object`) is passed through.
- The `openai` provider still calls `https://api.openai.com/v1/chat/completions` with `gpt-4o-mini`.
- Missing key raises `GROQ_API_KEY environment variable not set.`
- `LLM_MODEL=` (empty) gives `openai/gpt-oss-120b`. `LLM_MODEL=custom-x` gives `custom-x`.
- Tested with a real free Groq key on the running backend: `GET /api/llm/health` returns `{"provider":"groq","model":"openai/gpt-oss-120b","status":"ok"}`.
