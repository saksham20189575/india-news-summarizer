# India News Summarizer

AI-powered India news briefing: **n8n Cloud** (Gemini) collects and summarizes hourly; a **Next.js** app on Vercel stores and displays the latest JSON.

## Phase 0 status

Foundations are in place. See [`docs/phase0-decisions.md`](docs/phase0-decisions.md).

| Piece | Location |
|-------|----------|
| Decisions | `docs/phase0-decisions.md` |
| Briefing JSON contract | `contracts/briefing.schema.json` |
| Sources (RSS-first) | `config/sources.json` |
| Fixtures | `fixtures/` |
| Express API (legacy) | `api/` |
| Next.js app (UI + API) | `web/` |
| n8n exports | `workflows/` |
| Collection parsers | `lib/collection/` |
| Normalize / dedupe | `lib/normalize/` |
| AI categorize / summarize | `lib/ai/` · `prompts/` |

## Stack

- **n8n Cloud** — orchestration, credentials, hourly schedule (Phase 1+)
- **Gemini** — categorization + summarization LLM
- **Next.js** — Bharat Brief UI + `PUT`/`GET /api/summary` (`web/`)

## Phase 5 status

Website API + Bharat Brief frontend are ready. See [`docs/phase5-notes.md`](docs/phase5-notes.md).

```bash
cd web
cp .env.example .env.local   # set PUBLISH_API_KEY
npm install
npm run seed                 # optional fixture
npm run dev                  # http://localhost:3000
npm run verify               # exit-criteria checks (dev server running)
```

## Phase 4 status

Two-stage AI (categorize → summarize) is in the repo. See [`docs/phase4-notes.md`](docs/phase4-notes.md).

```bash
node lib/ai/selftest.js
node scripts/process-ai.js --mock --out fixtures/ai/briefing_intermediate.json
# GEMINI_API_KEY=... node scripts/process-ai.js --live
```

Then import [`workflows/india-news-summarizer.json`](workflows/india-news-summarizer.json) into n8n Cloud, set Variable `GEMINI_API_KEY` (`$vars.GEMINI_API_KEY`), and run **Manual Trigger**.

## Quick start (local)

```bash
cd web
cp .env.example .env.local   # set PUBLISH_API_KEY (openssl rand -hex 32)
npm install
npm run dev                  # http://localhost:3000
```

Seed a valid fixture:

```bash
cd web
npm run seed
# or via HTTP:
source .env.local 2>/dev/null || true
curl -sS -X PUT http://localhost:3000/api/summary \
  -H "Authorization: Bearer $PUBLISH_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @../fixtures/briefing_valid.json
```

## Docs

- [`docs/problemStatement.md`](docs/problemStatement.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/implementation-plan.md`](docs/implementation-plan.md)
- [`docs/phase0-decisions.md`](docs/phase0-decisions.md)
- [`docs/phase1-notes.md`](docs/phase1-notes.md)
- [`docs/phase2-notes.md`](docs/phase2-notes.md)
- [`docs/phase3-notes.md`](docs/phase3-notes.md)
- [`docs/phase4-notes.md`](docs/phase4-notes.md)
- [`docs/phase5-notes.md`](docs/phase5-notes.md)
- [`docs/deployment-plan.md`](docs/deployment-plan.md) — Vercel (app + API + Blob) + n8n publish
- [`docs/edge-case.md`](docs/edge-case.md)
- [`docs/eval.md`](docs/eval.md)

## n8n Cloud

### Phase 0 (manual)

1. Timezone → `Asia/Kolkata`
2. Add **Gemini** credential and smoke-test one LLM node
3. Set n8n Variable **`GEMINI_API_KEY`** (`$vars.GEMINI_API_KEY`) for Phase 4 Code-node Gemini calls
4. Keep publish API key for Phase 6 (same value as `api/.env`)

### Phase 1–4 (workflow through AI)

1. Import [`workflows/india-news-summarizer.json`](workflows/india-news-summarizer.json)
2. Confirm inactive; cron `0 * * * *`; disable concurrent executions
3. Set Variable `GEMINI_API_KEY` (optional `$vars.AI_MOCK=true` for graph-only smoke-test)
4. Execute **Manual Trigger** and inspect **AI Categorize & Summarize** (`categories`, `ai`)
5. Details: [`docs/phase4-notes.md`](docs/phase4-notes.md)
