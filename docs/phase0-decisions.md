# Phase 0 Decisions

Frozen foundations for the India News Summarizer. See also [`implementation-plan.md`](./implementation-plan.md) Phase 0 and [`architecture.md`](./architecture.md).

| Decision | Choice |
|----------|--------|
| Orchestration | **n8n Cloud** (create workflows + store credentials in n8n) |
| Timezone | **Asia/Kolkata** (set on n8n Cloud workspace / workflow schedule) |
| LLM | **Google Gemini** (n8n Google Gemini / Google AI credential) |
| Frontend | **Next.js** (`web/`) |
| Backend API | **Node.js + Express** (`api/`) |
| Latest summary storage (v1) | File: `api/data/latest-summary.json` (atomic replace) |
| Publish auth | Shared secret `PUBLISH_API_KEY` in API env; n8n HTTP header `Authorization: Bearer <key>` |
| Email / Gmail | **Out of scope** |
| Schedule (later phases) | Hourly cron `0 * * * *` |
| Briefing contract | `schemaVersion: 1` — [`../contracts/briefing.schema.json`](../contracts/briefing.schema.json) |
| Sources | [`../config/sources.json`](../config/sources.json) (RSS-first) |

## Repo layout

```text
ai-automations/
├── docs/                  # Product + design docs
├── contracts/             # Frozen API / JSON schemas
├── config/                # Shared runtime config (sources, categories)
├── fixtures/              # Sample payloads for eval / local UI
├── lib/collection/        # RSS/HTML extractors (Phase 2+)
├── lib/normalize/         # Normalize / dedupe / cap (Phase 3+)
├── lib/ai/                # Categorize / summarize (Phase 4+)
├── prompts/               # Gemini prompt templates (Phase 4+)
├── workflows/             # Exported n8n workflow JSON
├── api/                   # Express publish/read API
└── web/                   # Next.js frontend
```

## n8n Cloud checklist (manual)

Complete these in the n8n Cloud UI (cannot be done from this repo alone):

1. Open your n8n Cloud workspace.
2. Set timezone to **Asia/Kolkata** (instance or workflow schedule timezone).
3. Create credential: **Google Gemini / Google AI** with your Gemini API key.
4. Smoke-test: one-node workflow with a Gemini chat/completion → expect a non-empty reply.
5. Confirm you can create workflows and store credentials (already available per project choice).
6. Later (Phase 6): add Header Auth / generic credential for `PUBLISH_API_KEY` when publishing to the Express API.

## Publish API key strategy

| Item | Value |
|------|--------|
| Env var (API) | `PUBLISH_API_KEY` |
| Env var (local web → API URL) | `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:4000`) |
| n8n → API | `Authorization: Bearer ${PUBLISH_API_KEY}` on `PUT /api/summary` |
| Browser | **Never** receives the publish key; frontend only calls `GET` |

Generate a key locally:

```bash
openssl rand -hex 32
```

Copy into `api/.env` (from `api/.env.example`). Do not commit real keys.

## Exit criteria status

| Criterion | Status |
|-----------|--------|
| Can create/execute workflows in n8n Cloud | Assumed available — confirm with Gemini smoke-test |
| LLM node returns a response (Gemini) | **Manual** — complete n8n checklist above |
| Timezone documented (`Asia/Kolkata`) | **Done** (this doc) |
| Website stack + JSON contract chosen | **Done** (Next.js + Express + `schemaVersion: 1`) |
