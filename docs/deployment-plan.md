# Deployment Plan: Bharat Brief

Production deployment for the India News Summarizer:

| Component | Platform | Repo path | Role |
|-----------|----------|-----------|------|
| **App (UI + API)** | Vercel | `web/` | Bharat Brief reader + `PUT`/`GET /api/summary` |
| **Briefing storage** | Vercel Blob | (attached to Vercel project) | Persists `latest-summary.json` |
| **Publisher** | n8n Cloud | `workflows/` | Hourly collect → AI → publish to Vercel |

Related docs: [`implementation-plan.md`](./implementation-plan.md) (Phases 6–8), [`phase0-decisions.md`](./phase0-decisions.md), [`phase5-notes.md`](./phase5-notes.md).

---

## Architecture (production)

```text
┌─────────────────┐     PUT /api/summary      ┌──────────────────────────────┐
│   n8n Cloud     │  Authorization: Bearer    │  Vercel (Next.js)            │
│  hourly cron    │ ────────────────────────▶ │  /api/summary  (route handler)│
│  Gemini + fetch │                           │         │                    │
└─────────────────┘                           │         ▼                    │
                                              │  Vercel Blob                 │
                                              │  latest-summary.json         │
                                              │         │                    │
                                              │  GET /api/summary (public)   │
                                              │  Bharat Brief UI (same app)  │
                                              └──────────┬───────────────────┘
                                                         │
                                              ┌──────────▼───────────┐
                                              │  Visitors (browser)  │
                                              └──────────────────────┘
```

**Data contract:** `schemaVersion: 1` — [`../contracts/briefing.schema.json`](../contracts/briefing.schema.json).

**Security rule:** `PUBLISH_API_KEY` lives only on **Vercel** (server env) and **n8n**. Never expose it to the browser or prefix it with `NEXT_PUBLIC_`.

**Same-origin benefit:** The UI reads the briefing via the shared store module in-process (no CORS, no separate API URL env var).

---

## Prerequisites

- GitHub repo connected to Vercel
- [Vercel](https://vercel.com) account
- [n8n Cloud](https://n8n.io/cloud) workspace (already used for the workflow)
- Domain optional (Vercel default URL works for v1)

Generate the publish secret once and reuse everywhere:

```bash
openssl rand -hex 32
```

Save as `PUBLISH_API_KEY` — set the **same value** on Vercel and in n8n.

---

## Environment variables

| Variable | Where | Required | Example / notes |
|----------|-------|----------|-----------------|
| `PUBLISH_API_KEY` | Vercel | Yes | `openssl rand -hex 32` |
| `PUBLISH_API_KEY` | n8n (Variable or Header Auth credential) | Yes | Same value as Vercel |
| `BLOB_READ_WRITE_TOKEN` | Vercel | Auto (prod) | Injected when you attach a Blob store; omit locally for file fallback |
| `GEMINI_API_KEY` | n8n Variable `$vars.GEMINI_API_KEY` | Yes | Already used in Phase 4 workflow |

Local dev equivalents: `web/.env.local` — see [`phase0-decisions.md`](./phase0-decisions.md).

---

## Recommended deployment order

Deploy in this sequence so each step has a real URL for the next:

1. **Vercel** — deploy `web/`, attach Blob store, set `PUBLISH_API_KEY`
2. **Smoke-test API** — health + optional seed PUT
3. **n8n** — point `website.publishUrl` at Vercel, configure publish auth
4. **End-to-end** — Manual Trigger in n8n → refresh Vercel site
5. **Go-live** — activate hourly schedule (Phase 8)

---

## 1. Vercel — app + API (`web/`)

### Project setup

1. Vercel → **Add New Project** → import the GitHub repo
2. **Root Directory:** `web`
3. **Framework Preset:** Next.js (auto-detected)
4. **Build Command:** `npm run build` (default)
5. **Output:** Next.js default

### Vercel Blob (persistent storage)

Production needs durable storage for the latest briefing. Without Blob, serverless redeploys would lose in-memory/ephemeral data.

1. Vercel project → **Storage** → **Create Database / Store** → **Blob**
2. Connect the Blob store to this project
3. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically — do not commit it

Local dev skips Blob when the token is unset; the API writes to `web/data/latest-summary.json` instead.

### Vercel environment variables

**Production:**

```env
PUBLISH_API_KEY=<your-64-char-hex-key>
```

`BLOB_READ_WRITE_TOKEN` is set by the Blob store attachment — no manual copy needed.

Deploy and copy the public URL, e.g. `https://bharat-brief.vercel.app`.

### API routes (merged from Express)

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/health` | `web/app/health/route.ts` |
| `GET` | `/api/summary` | `web/app/api/summary/route.ts` |
| `PUT` | `/api/summary` | `web/app/api/summary/route.ts` (Bearer auth) |

Storage logic: `web/lib/briefing-store.ts` (Blob in prod, file locally).

### Post-deploy API checks

```bash
export API=https://your-app.vercel.app
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

Or from `web/` with the app running locally: `npm run verify`.

---

## 2. n8n Cloud — publish to Vercel

n8n is the **only writer** in production (apart from manual bootstrap). It runs on n8n Cloud; no separate backend deploy is needed.

### A. Regenerate workflow with production publish URL

From repo root:

```bash
WEBSITE_PUBLISH_BASE_URL=https://your-app.vercel.app \
  node workflows/scripts/generate-phase4-workflow.js
```

This sets `config.website.publishUrl` to `https://your-app.vercel.app/api/summary`.

Re-import [`workflows/india-news-summarizer.json`](../workflows/india-news-summarizer.json) into n8n Cloud after regenerating, or edit the **Load Config** / **HTTP Request — Publish** node URLs in the UI.

### B. n8n credentials & variables

| Item | Where in n8n | Value |
|------|----------------|-------|
| Gemini | Credential + Variable | `$vars.GEMINI_API_KEY` |
| Publish auth | **Variable** `PUBLISH_API_KEY` or **Header Auth** credential | Same as Vercel `PUBLISH_API_KEY` |

**HTTP Request — Publish** (Phase 6):

| Field | Value |
|-------|--------|
| Method | `PUT` |
| URL | `https://your-app.vercel.app/api/summary` |
| Authentication | Header Auth or raw header |
| Header | `Authorization: Bearer <PUBLISH_API_KEY>` |
| Body | Canonical briefing JSON from formatter Code node |
| On failure | Retry with backoff; do **not** clear stored briefing |

Auth header template in repo config: [`config/sources.json`](../config/sources.json) → `website.authHeader`.

### C. Workflow settings (unchanged from Phase 1–4)

- Timezone: **Asia/Kolkata**
- Schedule: `0 * * * *` — keep **Inactive** until end-to-end test passes (Phase 8)
- **Disable concurrent executions**
- Execution timeout: 3300s

### D. n8n → Vercel connectivity

n8n Cloud calls your Vercel **public HTTPS** URL. No VPN or allowlist needed.

Test with **Manual Trigger** before activating the schedule:

1. Run workflow
2. Confirm publish HTTP node returns 200
3. `curl https://your-app.vercel.app/api/summary` shows new `generatedAt`
4. Refresh Vercel site — content updates

---

## 3. Production verification checklist

Use this before Phase 8 go-live:

| # | Check | How |
|---|--------|-----|
| 1 | API healthy | `GET /health` → 200 |
| 2 | Unauthorized PUT rejected | `PUT` without Bearer → 401 |
| 3 | Valid PUT stores briefing | n8n or curl with key → 200 |
| 4 | GET returns latest | `GET /api/summary` → 200 + JSON |
| 5 | Invalid PUT keeps old data | Bad schema → 400; previous blob unchanged |
| 6 | Frontend loads briefing | Vercel URL shows categories + links |
| 7 | Frontend empty state | Before first publish → “No summary yet” |
| 8 | n8n manual run updates site | `generatedAt` advances on Vercel |
| 9 | Source links work | Click through to real news URLs |
| 10 | Blob store attached | Redeploy app; summary survives without n8n run |
| 11 | Publish key not in browser | Inspect Vercel env + network tab — no `PUBLISH_*` in client |
| 12 | Hourly schedule ready | Cron configured, still inactive until sign-off |

---

## 4. Staging vs production (optional)

Simple two-environment pattern:

| Env | Vercel | Blob | n8n |
|-----|--------|------|-----|
| Staging | Preview or separate project | Separate Blob store | Duplicate workflow or manual-only |
| Production | Primary Vercel project | Production Blob store | Active hourly workflow |

Use different `PUBLISH_API_KEY` per environment. Point staging n8n at staging Vercel URL only.

---

## 5. Operational notes

### Redeploys

- **Vercel:** Redeploy on `web/` changes; briefing persists in Blob across redeploys
- **n8n:** Re-import workflow JSON after generator changes; update Variables if keys rotate

### Secret rotation

1. Generate new `PUBLISH_API_KEY`
2. Update Vercel variable → redeploy
3. Update n8n Variable / credential
4. Run manual n8n publish to confirm

### Monitoring (v1 minimal)

- Vercel function logs: failed starts, 500 on read/write
- n8n execution history: publish HTTP failures, empty corpus, AI guard paths
- Manual spot-check: Vercel “Last updated” advances each hour after go-live

### Legacy Express API (`api/`)

The standalone Express app in `api/` is no longer used in production. It remains in the repo for reference and local comparison. All production traffic goes through `web/app/api/summary`.

---

## 6. Quick reference — URLs to wire

After deploy, fill this in for your team:

```text
Vercel site + API:  https://________________.vercel.app
n8n publish URL:    https://________________.vercel.app/api/summary
Health check:       https://________________.vercel.app/health
```

**n8n generator one-liner:**

```bash
WEBSITE_PUBLISH_BASE_URL=https://YOUR-APP.vercel.app \
  node workflows/scripts/generate-phase4-workflow.js
```

---

## 7. Related implementation phases

| Phase | Deployment tie-in |
|-------|---------------------|
| **Phase 5** | API + UI done — merged into `web/` |
| **Phase 6** | Wire n8n formatter + HTTP publish to Vercel URL |
| **Phase 7** | Publish retries; failed runs must not wipe stored briefing |
| **Phase 8** | Activate cron; confirm hourly Vercel refresh |

---

## 8. Troubleshooting

| Problem | Likely cause | Action |
|---------|--------------|--------|
| Site shows “Could not load the latest briefing” | Blob misconfigured or function error | Check Vercel logs; confirm Blob store attached |
| n8n publish 401 | Key mismatch | Align n8n and Vercel `PUBLISH_API_KEY` |
| n8n publish 400 | Invalid briefing JSON | Fix Phase 6 formatter; check schema |
| n8n publish 500 | Missing `PUBLISH_API_KEY` on Vercel | Set env var and redeploy |
| Site empty after redeploy | Blob store not attached | Add Blob store; republish from n8n |
| 404 on GET forever | n8n never succeeded | Manual Trigger; check publish node |
| Gemini errors in n8n | Missing `$vars.GEMINI_API_KEY` | Set n8n Variable |
| Local dev empty after restart | File mode — run `npm run seed` | Seed or PUT with publish key |

---

## Definition of done (deployed v1)

1. Vercel serves `GET`/`PUT /api/summary` with auth and validation
2. Vercel displays the latest briefing from Blob storage
3. n8n manual run publishes to Vercel and updates the live site
4. Hourly n8n schedule can be activated (Phase 8) with confidence
5. Secrets are scoped correctly (publish key never in browser)
