# Bharat Brief (Next.js)

Reads `GET {NEXT_PUBLIC_API_BASE_URL}/api/summary` and renders the latest India news briefing.

UI follows the Stitch design in `../stitch_bharat_brief_news_reader/` (editorial single-column reader).

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000
```

Requires the Express API on port 4000 (or update `NEXT_PUBLIC_API_BASE_URL`).

See [`../docs/phase5-notes.md`](../docs/phase5-notes.md).
