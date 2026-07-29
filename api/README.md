# India News API (Express) — legacy

> **Production:** API routes are merged into Next.js (`web/app/api/summary`). Deploy only `web/` on Vercel. This Express app remains for reference and side-by-side comparison.

Stores and serves the latest briefing JSON for the Next.js frontend and n8n publisher (Phase 5).

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | none | Liveness |
| `GET` | `/api/summary` | none | Read latest briefing (`404` if empty) |
| `PUT` | `/api/summary` | `Authorization: Bearer $PUBLISH_API_KEY` | Replace latest (n8n) |

Storage: `data/latest-summary.json` (atomic write). Schema: `../contracts/briefing.schema.json`.

## Local

```bash
cp .env.example .env   # set a real PUBLISH_API_KEY
npm install
npm run seed           # optional fixture → data/latest-summary.json
npm run dev            # http://localhost:4000
npm run verify         # exit-criteria checks (API must be running)
```

See [`../docs/phase5-notes.md`](../docs/phase5-notes.md).
