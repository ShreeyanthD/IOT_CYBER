# Deployment guide (quick / short-term)

This is the setup used to put IoT Sentinel online for a demo or a short period (a day or so) **for free**:

- **Backend:** runs on your own machine and is exposed to the internet through a free **Cloudflare quick tunnel**.
- **Frontend:** a static build hosted on **Vercel**'s free tier, pointed at the tunnel.

Why not host the backend in the cloud? With PyTorch, sentence-transformers and XGBoost loaded, it needs roughly 1.5–2 GB of RAM, which is more than most free tiers give (Render's free tier, for example, has 512 MB). Running it locally avoids that limit.

> For a permanent deployment, run the backend on a VM with at least 2 GB RAM (for example Oracle Cloud Always Free, or a small paid VPS) and keep the same frontend setup.

---

## Prerequisites

- The backend runs locally already: `backend/venv` exists, `pip install -r requirements.txt` has been done, and `run_backend.bat` starts without errors.
- A GitHub account with this repo (or a fork) and a free Vercel account.
- *(Optional, for the AI agent features)* a free Groq API key from https://console.groq.com, since Ollama isn't reachable from a hosted setup unless it runs on the same machine.

---

## One-time setup

### 1. Configure the backend `.env`

In `backend/.env` (copy it from `.env.example` if it doesn't exist):

```dotenv
# AI provider (optional; skip this to keep using Ollama on the same machine)
LLM_PROVIDER=groq
LLM_MODEL=
GROQ_API_KEY=gsk_your_key_here

# Filled in at step 4, after the frontend has a URL
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Leave `LLM_MODEL` empty to use the default Groq model (`openai/gpt-oss-120b`).

### 2. Install cloudflared

Either:

```
winget install --id Cloudflare.cloudflared
```

or download `cloudflared-windows-amd64.exe` from https://github.com/cloudflare/cloudflared/releases/latest, rename it to `cloudflared.exe`, and keep it **outside the repo**. To confirm the download is genuine: right-click → Properties → Digital Signatures should show **Cloudflare, Inc.**

### 3. Start the backend and the tunnel

```
run_backend.bat
```

Wait for `Application startup complete.` Then, in a second terminal:

```
cloudflared tunnel --url http://127.0.0.1:8000
```

It prints a public address like `https://random-words.trycloudflare.com`. Check that `https://<that-address>/docs` opens in a browser.

### 4. Deploy the frontend on Vercel

1. On vercel.com: **Add New → Project**, then import the repository.
2. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Environment Variable:** `VITE_API_URL` = `https://<tunnel-address>/api`
3. **Deploy.** Vercel builds the production branch (`main` by default). If you're deploying a branch other than `main`, set it under **Settings → Environments → Production → Branch Tracking** (or **Settings → Git** on older layouts) and redeploy.
4. You get a URL such as `https://<project>.vercel.app`.

### 5. Allow the Vercel site in CORS

In `backend/.env`:

```dotenv
CORS_ORIGINS=https://<project>.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

No trailing slash. Restart **only the backend** (Ctrl+C, then `run_backend.bat`) and leave the tunnel running.

Open `https://<project>.vercel.app` from any device. The dashboard should load data, and a sample pcap from `sample_pcaps/` should upload and run detection.

---

## Starting it again later (each session)

1. `run_backend.bat`, and wait for `Application startup complete.`
2. `cloudflared tunnel --url http://127.0.0.1:8000`, and copy the **new** address. Quick-tunnel addresses change every run.
3. In Vercel: **Settings → Environment Variables** → set `VITE_API_URL` to `https://<new-address>/api` → **Save** → **Deployments → ⋯ → Redeploy**.

`CORS_ORIGINS` and the rest of the Vercel setup stay the same, because the `vercel.app` URL doesn't change.

## Stopping

Press Ctrl+C in the tunnel window and the backend window. The Vercel site stays up but shows API errors until the backend and tunnel run again.

Running the backend modifies the RAG index files in `backend/data/chroma_db/` and writes reports to `backend/storage/reports/`. Don't commit these. Undo the index changes with:

```
git restore backend/data/chroma_db
```

---

## Known limitations

| Limitation | Why / workaround |
|---|---|
| The site is only up while your machine is on, awake, and has both windows open | The backend runs locally. Set the machine to never sleep while it's live. |
| The tunnel URL changes every time cloudflared restarts | This is how quick tunnels work. Update `VITE_API_URL` in Vercel and redeploy. A named Cloudflare tunnel (needs a Cloudflare account and a domain) gives a fixed URL. |
| Requests longer than ~100 s fail with HTTP 524 | Cloudflare closes long-running requests. A full multi-agent analysis that runs longer than that will error through the tunnel even though it works locally. |
| Some mobile networks can't resolve `*.trycloudflare.com` | This is the carrier's DNS. Setting the phone's Private DNS to `one.one.one.one` usually fixes it. Most networks are fine. |
| Live packet capture | Works only because the backend runs on a real machine with tshark installed. On a cloud VM it can't see your network, so use PCAP/CSV upload there. |
| Anyone with the URL can use the app | There is no authentication. Share the URL only with people who should use it, and stop the tunnel when you're done. |
