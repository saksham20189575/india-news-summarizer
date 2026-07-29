# n8n workflows

## Current

| Workflow | Phase | File | Active |
|----------|-------|------|--------|
| India News Summarizer | 6 (format + publish) | [`india-news-summarizer.json`](./india-news-summarizer.json) | **false** |

## Import

1. n8n Cloud → Import from File → `india-news-summarizer.json`
2. Set n8n Variables:
   - **`GEMINI_API_KEY`** (`$vars.GEMINI_API_KEY`)
   - **`PUBLISH_API_KEY`** (`$vars.PUBLISH_API_KEY`) — same value as Railway
3. Workflow settings: timezone `Asia/Kolkata`, timeout `3300s`, **one execution at a time**
4. Keep **Inactive** until Phase 8
5. Run via **Manual Trigger** → inspect **Publish to API** (200) → refresh Vercel site

Details: [`../docs/phase4-notes.md`](../docs/phase4-notes.md) · [`../docs/deployment-plan.md`](../docs/deployment-plan.md)  
Earlier: [`../docs/phase3-notes.md`](../docs/phase3-notes.md) · [`../docs/phase2-notes.md`](../docs/phase2-notes.md) · [`../docs/phase1-notes.md`](../docs/phase1-notes.md)

## Regenerate workflow JSON

```bash
# Local API
WEBSITE_PUBLISH_BASE_URL=http://localhost:4000 \
  node workflows/scripts/generate-phase4-workflow.js

# Production (Railway)
WEBSITE_PUBLISH_BASE_URL=https://your-api.up.railway.app \
  node workflows/scripts/generate-phase4-workflow.js
```

Config: [`../config/sources.json`](../config/sources.json)  
Parsers: [`../lib/collection/`](../lib/collection/) · [`../lib/normalize/`](../lib/normalize/) · [`../lib/ai/`](../lib/ai/) · [`../lib/format/`](../lib/format/)  
Prompts: [`../prompts/`](../prompts/)

## Local pipeline (no n8n)

```bash
node lib/collection/selftest.js
node lib/normalize/selftest.js
node lib/ai/selftest.js
node lib/format/selftest.js
node scripts/collect-news.js --out fixtures/collection/latest.json
node scripts/normalize-articles.js --live --out fixtures/collection/normalized.json
node scripts/process-ai.js --mock --out fixtures/ai/briefing_intermediate.json
node scripts/format-briefing.js --in fixtures/ai/briefing_intermediate.json --out fixtures/briefing_formatted.json
# Publish (API running):
# PUBLISH_API_KEY=... node scripts/publish-briefing.js --in fixtures/briefing_valid.json
```

## Credentials

| Credential / env | Phase |
|------------------|-------|
| Google Gemini / Google AI | 0 smoke-test, **4 AI** (`gemini-3.5-flash-lite`) |
| `GEMINI_API_KEY` n8n Variable (`$vars`) | **4** — AI Code node |
| `PUBLISH_API_KEY` n8n Variable (`$vars`) | **6** — Publish Code node (same as Railway) |

Do not commit secrets. Scrub credentials before re-exporting JSON to git.
