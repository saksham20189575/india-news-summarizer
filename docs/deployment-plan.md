# Deployment Plan: Bharat Brief

Production deployment for the India News Summarizer:

| Component | Platform | Repo path | Role |
|-----------|----------|-----------|------|
| **Backend API** | Railway | `api/` | Store latest briefing (`PUT`/`GET /api/summary`) |
| **Frontend** | Vercel | `web/` | Bharat Brief reader UI |
| **Publisher** | n8n Cloud | `workflows/` | Hourly collect → AI → publish to Railway |

Related docs: [`implementation-plan.md`](./implementation-plan.md) (Phases 6–8), [`phase0-decisions.md`](./phase0-decisions.md), [`phase5-notes.md`](./phase5-notes.md).

---

## Architecture (production)

```text
┌─────────────────┐     PUT /api/summary      ┌──────────────────────┐
│   n8n Cloud     │  Authorization: Bearer    │  Railway (Express)   │
│  hourly cron    │ ────────────────────────▶ │  api/data/           │
│  Gemini + fetch │                           │  latest-summary.json │
└─────────────────┘                           └──────────┬───────────┘
                                                           │
                                              GET /api/summary (public)
                                                           │
                                                ┌──────────▼───────────┐
                                                │  Vercel (Next.js)    │
                                                │  Bharat Brief UI     │
                                                └──────────┬───────────┘
                                                           │
                                                ┌──────────▼───────────┐
                                                │  Visitors (browser)  │
                                                └──────────────────────┘
```

**Data contract:** `schemaVersion: 1` — [`../contracts/briefing.schema.json`](../contracts/briefing.schema.json).

**Security rule:** `PUBLISH_API_KEY` lives only on **Railway** and **n8n**. Never set it on Vercel or expose it to the browser.

---

## Prerequisites

- GitHub repo connected to Railway and Vercel
- [Railway](https://railway.app) account (backend)
- [Vercel](https://vercel.com) account (frontend)
- [n8n Cloud](https://n8n.io/cloud) workspace (already used for the workflow)
- Domain optional (Railway/Vercel default URLs work for v1)

Generate the publish secret once and reuse everywhere:

```bash
openssl rand -hex 32
```

Save as `PUBLISH_API_KEY` — you will set the **same value** on Railway and in n8n.

---

## Environment variables

| Variable | Where | Required | Example / notes |
|----------|-------|----------|-----------------|
| `PUBLISH_API_KEY` | Railway | Yes | `openssl rand -hex 32` |
| `PUBLISH_API_KEY` | n8n (Variable or Header Auth credential) | Yes | Same value as Railway |
| `CORS_ORIGIN` | Railway | Yes (prod) | `https://your-app.vercel.app` or custom domain |
| `PORT` | Railway | Auto | Railway injects this; do not hardcode in code |
| `NEXT_PUBLIC_API_BASE_URL` | Vercel | Yes | `https://your-api.up.railway.app` (no trailing slash) |
| `GEMINI_API_KEY` | n8n Variable `$vars.GEMINI_API_KEY` | Yes | Already used in Phase 4 workflow |

Local dev equivalents: `api/.env`, `web/.env.local` — see [`phase0-decisions.md`](./phase0-decisions.md).

---

## Recommended deployment order

Deploy in this sequence so each step has a real URL for the next:

1. **Railway** — deploy API, attach volume, set env vars
2. **Smoke-test API** — health + optional seed PUT
3. **Vercel** — deploy web with `NEXT_PUBLIC_API_BASE_URL`
4. **Railway CORS** — set `CORS_ORIGIN` to the Vercel URL (or custom domain)
5. **n8n** — point `website.publishUrl` at Railway, configure publish auth
6. **End-to-end** — Manual Trigger in n8n → refresh Vercel site
7. **Go-live** — activate hourly schedule (Phase 8)

---

## 1. Railway — backend (`api/`)

### Service setup

1. Railway → **New Project** → **Deploy from GitHub repo**
2. Add a service for this repo
3. **Settings → Root Directory:** `api`
4. **Settings → Build:** Nixpacks auto-detects Node; no custom Dockerfile required for v1
5. **Settings → Start Command:** `npm start` (runs `node src/index.js`)
6. **Settings → Healthcheck path (optional):** `/health`

Railway sets `PORT` automatically. The app already reads `process.env.PORT`.

### Persistent storage (important)

v1 stores the latest briefing in **`api/data/latest-summary.json`**. Railway containers use an **ephemeral filesystem** — redeploys can wipe the file unless you attach a volume.

**Recommended for v1:**

1. Railway service → **Volumes** → **Add Volume**
2. Mount path: `/app/data`
3. This matches the API’s data directory when the service root is `api/`

Without a volume, the site still works: n8n republishes every hour, but a redeploy between runs may show “No summary yet” until the next successful publish.

### Railway environment variables

In **Variables** for the API service:

```env
PUBLISH_API_KEY=<your-64-char-hex-key>
CORS_ORIGIN=https://your-app.vercel.app
```

Use your final Vercel URL (or custom domain). If Vercel isn’t deployed yet, use a placeholder and update `CORS_ORIGIN` after step 3.

Deploy and copy the public URL, e.g. `https://india-news-api-production.up.railway.app`.

### Post-deploy API checks

```bash
export API=https://your-api.up.railway.app
export KEY=<your-publish-key>

# Liveness
curl -sS "$API/health"

# Empty state before first publish
curl -sS -o /dev/null -w "%{http_code}\n" "$API/api/summary"
# → 404 (expected until n8n or seed publishes)

# Unauthorized write rejected
curl -sS -o /dev/null -w "%{http_code}\n" -X PUT "$API/api/summary" \
  -H 'Content-Type: application/json' \
  -d @fixtures/briefing_valid.json
# → 401

# Authorized seed (optional bootstrap)
curl -sS -X PUT "$API/api/summary" \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @fixtures/briefing_valid.json

# Read back
curl -sS "$API/api/summary" | head
```

Or run locally against production (with API up): `cd api && API_BASE=$API npm run verify` after pointing verify script — manual curls above are enough for prod.

---

## 2. Vercel — frontend (`web/`)

### Project setup

1. Vercel → **Add New Project** → import the same GitHub repo
2. **Root Directory:** `web`
3. **Framework Preset:** Next.js (auto-detected)
4. **Build Command:** `npm run build` (default)
5. **Output:** Next.js default

### Vercel environment variables

**Production** (and Preview if you want staging):

```env
NEXT_PUBLIC_API_BASE_URL=https://your-api.up.railway.app
```

Redeploy after changing this variable — it is baked in at build time for server components.

### Custom domain (optional)

1. Vercel → Project → **Domains** → add domain
2. Update Railway `CORS_ORIGIN` to match, e.g. `https://bharatbrief.example.com`
3. Redeploy / restart Railway service if CORS was wrong on first deploy

### Post-deploy frontend checks

- Open the Vercel URL
- If API was seeded: categories, source links, IST “Last updated”
- If not seeded yet: “No summary yet” (404 from API) — expected until n8n publishes
- Confirm browser network tab only calls `GET …/api/summary` (never `PUT`, never publish key)

---

## 3. n8n Cloud — publish to Railway

n8n is the **only writer** in production (apart from manual bootstrap). It runs on n8n Cloud; no Railway/Vercel deploy needed for n8n itself.

### A. Regenerate workflow with production publish URL

From repo root:

```bash
WEBSITE_PUBLISH_BASE_URL=https://your-api.up.railway.app \
  node workflows/scripts/generate-phase4-workflow.js
```

This sets `config.website.publishUrl` to `https://your-api.up.railway.app/api/summary` (Phase 6 adds the HTTP publish node; until then, update **Load Config** manually in n8n if you haven’t regenerated).

Re-import [`workflows/india-news-summarizer.json`](../workflows/india-news-summarizer.json) into n8n Cloud after Phase 6 publish nodes exist, or edit the **Load Config** / **HTTP Request — Publish** node URLs in the UI.

### B. n8n credentials & variables

| Item | Where in n8n | Value |
|------|----------------|-------|
| Gemini | Credential + Variable | `$vars.GEMINI_API_KEY` |
| Publish auth | **Variable** `PUBLISH_API_KEY` or **Header Auth** credential | Same as Railway `PUBLISH_API_KEY` |

**HTTP Request — Publish** (Phase 6):

| Field | Value |
|-------|--------|
| Method | `PUT` |
| URL | `https://your-api.up.railway.app/api/summary` |
| Authentication | Header Auth or raw header |
| Header | `Authorization: Bearer <PUBLISH_API_KEY>` |
| Body | Canonical briefing JSON from formatter Code node |
| On failure | Retry with backoff; do **not** clear Railway storage |

Auth header template in repo config: [`config/sources.json`](../config/sources.json) → `website.authHeader`.

### C. Workflow settings (unchanged from Phase 1–4)

- Timezone: **Asia/Kolkata**
- Schedule: `0 * * * *` — keep **Inactive** until end-to-end test passes (Phase 8)
- **Disable concurrent executions**
- Execution timeout: 3300s

### D. n8n → Railway connectivity

n8n Cloud calls your Railway **public HTTPS** URL. No VPN or allowlist needed for standard Railway/Vercel setups.

Test with **Manual Trigger** before activating the schedule:

1. Run workflow
2. Confirm publish HTTP node returns 200
3. `curl https://your-api.up.railway.app/api/summary` shows new `generatedAt`
4. Refresh Vercel site — content updates

---

## 4. CORS checklist

The API allows browser `GET` from the Vercel origin only.

| Symptom | Fix |
|---------|-----|
| Browser blocked fetch from Vercel | Set Railway `CORS_ORIGIN` to exact Vercel origin (scheme + host, no path) |
| Preview deployments fail | Add preview URL to CORS, or use a single production Vercel URL for v1 |
| n8n PUT fails | CORS does not affect server-to-server PUT; check `PUBLISH_API_KEY` and URL |

`api/src/index.js` uses `CORS_ORIGIN` for `GET`/`PUT`/`OPTIONS`. n8n `PUT` is not browser-based but CORS allows `PUT` for consistency.

---

## 5. Production verification checklist

Use this before Phase 8 go-live:

| # | Check | How |
|---|--------|-----|
| 1 | API healthy | `GET /health` → 200 |
| 2 | Unauthorized PUT rejected | `PUT` without Bearer → 401 |
| 3 | Valid PUT stores briefing | n8n or curl with key → 200 |
| 4 | GET returns latest | `GET /api/summary` → 200 + JSON |
| 5 | Invalid PUT keeps old data | Bad schema → 400; previous file unchanged |
| 6 | Frontend loads briefing | Vercel URL shows categories + links |
| 7 | Frontend empty state | Delete/skip seed → “No summary yet” |
| 8 | n8n manual run updates site | `generatedAt` advances on Vercel |
| 9 | Source links work | Click through to real news URLs |
| 10 | Volume mounted (if used) | Redeploy API; summary survives without n8n run |
| 11 | Publish key not in Vercel | Inspect Vercel env + browser — no `PUBLISH_*` |
| 12 | Hourly schedule ready | Cron configured, still inactive until sign-off |

---

## 6. Staging vs production (optional)

Simple two-environment pattern:

| Env | Railway API | Vercel | n8n |
|-----|-------------|--------|-----|
| Staging | Separate Railway service + volume | Preview or `staging` project | Duplicate workflow or manual-only |
| Production | Primary Railway service | Production Vercel project | Active hourly workflow |

Use different `PUBLISH_API_KEY` per environment. Point staging n8n at staging Railway URL only.

---

## 7. Operational notes

### Redeploys

- **Vercel:** Redeploy on `web/` changes; rebuild required when `NEXT_PUBLIC_API_BASE_URL` changes
- **Railway:** Redeploy on `api/` changes; with volume, `latest-summary.json` persists
- **n8n:** Re-import workflow JSON after generator changes; update Variables if keys rotate

### Secret rotation

1. Generate new `PUBLISH_API_KEY`
2. Update Railway variable → redeploy
3. Update n8n Variable / credential
4. Run manual n8n publish to confirm

### Monitoring (v1 minimal)

- Railway logs: failed starts, 500 on read/write
- n8n execution history: publish HTTP failures, empty corpus, AI guard paths
- Manual spot-check: Vercel “Last updated” advances each hour after go-live

### When file storage is not enough

Phase 9 / scale-up options (not required for v1):

- Railway **Postgres** or external KV (Upstash Redis) for `latest-summary`
- CDN cache on `GET /api/summary` (short TTL)
- Summary history (last N hours)

---

## 8. Quick reference — URLs to wire

After deploy, fill this in for your team:

```text
Railway API:     https://________________.up.railway.app
Vercel site:     https://________________.vercel.app
n8n publish URL: https://________________.up.railway.app/api/summary
CORS_ORIGIN:     https://________________.vercel.app
NEXT_PUBLIC_API_BASE_URL (Vercel): same as Railway API base (no /api/summary)
```

**n8n generator one-liner:**

```bash
WEBSITE_PUBLISH_BASE_URL=https://YOUR-RAILWAY-API.up.railway.app \
  node workflows/scripts/generate-phase4-workflow.js
```

---

## 9. Related implementation phases

| Phase | Deployment tie-in |
|-------|---------------------|
| **Phase 5** | API + UI done — this doc deploys them |
| **Phase 6** | Wire n8n formatter + HTTP publish to Railway URL |
| **Phase 7** | Publish retries; failed runs must not wipe Railway file |
| **Phase 8** | Activate cron; confirm hourly Vercel refresh |

---

## 10. Troubleshooting

| Problem | Likely cause | Action |
|---------|--------------|--------|
| Vercel shows “Could not reach the summary API” | Wrong `NEXT_PUBLIC_API_BASE_URL` or API down | Fix Vercel env; rebuild; check Railway deploy |
| CORS error in browser | `CORS_ORIGIN` mismatch | Set exact Vercel origin on Railway |
| n8n publish 401 | Key mismatch | Align n8n and Railway `PUBLISH_API_KEY` |
| n8n publish 400 | Invalid briefing JSON | Fix Phase 6 formatter; check schema |
| Site empty after Railway redeploy | No volume + no publish yet | Add volume or wait for n8n / seed once |
| 404 on GET forever | n8n never succeeded | Manual Trigger; check publish node |
| Gemini errors in n8n | Missing `$vars.GEMINI_API_KEY` | Set n8n Variable |

---

## Definition of done (deployed v1)

1. Railway serves `GET`/`PUT /api/summary` with auth and validation
2. Vercel displays the latest briefing from Railway
3. n8n manual run publishes to Railway and updates the live site
4. Hourly n8n schedule can be activated (Phase 8) with confidence
5. Secrets are scoped correctly (publish key never on Vercel)
