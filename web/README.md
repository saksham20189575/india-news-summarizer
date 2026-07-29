# Bharat Brief (Next.js)

Bharat Brief UI plus the publish/read API — all in one Next.js app on Vercel.

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/health` | GET | none | Liveness |
| `/api/summary` | GET | none | Read latest briefing (`404` if empty) |
| `/api/summary` | PUT | `Authorization: Bearer $PUBLISH_API_KEY` | Replace latest (n8n) |

**Storage:** Vercel Blob in production (`latest-summary.json`); local file fallback at `data/latest-summary.json` when `BLOB_READ_WRITE_TOKEN` is unset.

```bash
cp .env.example .env.local   # set PUBLISH_API_KEY
npm install
npm run seed                 # optional fixture → data/latest-summary.json
npm run dev                  # http://localhost:3000
npm run verify               # exit-criteria checks (dev server must be running)
```

See [`../docs/deployment-plan.md`](../docs/deployment-plan.md) and [`../docs/phase5-notes.md`](../docs/phase5-notes.md).

The legacy Express app in `api/` is kept for reference; production uses the merged Next.js routes above.
