# Phase 5 — Website API & Frontend

Stores the latest briefing JSON and renders it as **Bharat Brief** (Stitch design system in `stitch_bharat_brief_news_reader/`).

## Artifacts

| File | Purpose |
|------|---------|
| [`../api/`](../api/) | Express `GET`/`PUT /api/summary` + atomic file store |
| [`../web/`](../web/) | Next.js Bharat Brief reader UI |
| [`../fixtures/briefing_valid.json`](../fixtures/briefing_valid.json) | Seed / local UI fixture |
| [`../contracts/briefing.schema.json`](../contracts/briefing.schema.json) | Write validation (AJV) |
| [`../stitch_bharat_brief_news_reader/`](../stitch_bharat_brief_news_reader/) | Design tokens + HTML reference |

## Data flow

```text
n8n (Phase 6) ──PUT /api/summary──▶ api/data/latest-summary.json
Browser        ──GET /api/summary──▶ Next.js page (Bharat Brief)
```

## API

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/health` | none | Liveness |
| `GET` | `/api/summary` | none | Latest briefing, or `404` if none |
| `PUT` | `/api/summary` | `Authorization: Bearer $PUBLISH_API_KEY` | Validate schema → atomic replace |

- Storage: `api/data/latest-summary.json` (write via `.tmp` + `rename`)
- Invalid / unauthorized writes do **not** overwrite the previous good file
- CORS: `CORS_ORIGIN` (default `http://localhost:3000`)
- Browser never receives `PUBLISH_API_KEY`

## Frontend (Bharat Brief)

Renders from Stitch editorial system:

- Brand: **Bharat Brief** (Playfair Display)
- Body: Merriweather; labels/links: Public Sans
- Soft paper background, single 680px column, saffron category accents, teal source links
- Last updated (relative + IST stamp), “Refreshes every hour”
- Category sections with bullets + source links
- Partial-failure note from `meta.failedSources`
- Empty (`404`) and error states
- Soft client refresh every 5 minutes + reading progress bar

## Local run

```bash
# Terminal 1 — API
cd api
cp .env.example .env   # set PUBLISH_API_KEY (openssl rand -hex 32)
npm install
npm run seed           # copies fixtures/briefing_valid.json → data/
npm run dev            # http://localhost:4000

# Terminal 2 — Web
cd web
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

## Verify exit criteria

With the API running:

```bash
cd api
npm run verify
```

Manual curls (replace `$KEY`):

```bash
# Unauthorized rejected
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:4000/api/summary \
  -H 'Content-Type: application/json' \
  -d @../fixtures/briefing_valid.json
# → 401

# Store fixture
curl -s -X PUT http://localhost:4000/api/summary \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d @../fixtures/briefing_valid.json

# Read back
curl -s http://localhost:4000/api/summary | head

# Invalid body rejected (previous latest kept)
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:4000/api/summary \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"schemaVersion":2,"categories":[]}'
# → 400
```

Open `http://localhost:3000` — expect categories, source links, and last-updated stamp.

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Manual `curl` PUT with API key stores fixture | **Verified** via `npm run verify` |
| `GET /api/summary` returns that fixture | **Verified** |
| Frontend displays categories, sources, last updated | **Done** (Bharat Brief UI) |
| Unauthorized PUT rejected | **Verified** (401) |
| Invalid PUT does not wipe previous good data | **Verified** |

## Out of scope this phase

- n8n → API publish wiring (Phase 6)
- Hourly schedule activation (Phase 8)
- History / category filters (Phase 9)
