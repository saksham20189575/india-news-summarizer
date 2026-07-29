# Phase 1 — Workflow Skeleton & Scheduler

Importable n8n Cloud workflow for Phase 1 of [`implementation-plan.md`](./implementation-plan.md).

## Artifact

| File | Purpose |
|------|---------|
| [`../workflows/india-news-summarizer.json`](../workflows/india-news-summarizer.json) | Import into n8n Cloud |
| [`../workflows/scripts/generate-phase1-workflow.js`](../workflows/scripts/generate-phase1-workflow.js) | Regenerate workflow from `config/sources.json` |

## Graph

```text
Manual Trigger ──▶ Set Mode Manual ────┐
                                       ├──▶ Build Run Context ──▶ Load Config ──▶ Done (Phase 1 stub)
Schedule Trigger ─▶ Set Mode Scheduled ┘
   cron: 0 * * * *
   tz: Asia/Kolkata (workflow settings)
   active: false  (do not enable until Phase 8)
```

## Output shape (after Load Config)

```json
{
  "runId": "uuid",
  "runDate": "YYYY-MM-DD",
  "triggeredAt": "ISO-8601",
  "mode": "manual | scheduled",
  "timezone": "Asia/Kolkata",
  "config": {
    "timezone": "Asia/Kolkata",
    "maxArticlesPerSource": 8,
    "maxArticlesTotal": 40,
    "llm": { "provider": "gemini" },
    "website": {
      "publishUrl": "http://localhost:4000/api/summary",
      "publishMethod": "PUT",
      "authHeaderTemplate": "Authorization: Bearer <PUBLISH_API_KEY>",
      "apiKeyCredentialHint": "..."
    },
    "categories": ["Politics", "..."],
    "sources": [/* 5 sources */],
    "enabledSourceCount": 5
  },
  "phase": "phase1-skeleton"
}
```

## Import into n8n Cloud

1. Open n8n Cloud → **Workflows** → **Import from File**.
2. Select `workflows/india-news-summarizer.json`.
3. Open **Workflow settings**:
   - Timezone = `Asia/Kolkata` (should already be set)
   - Timeout = `3300` seconds (~55 min; under 1 hour)
   - Enable **This workflow can only have one execution at a time** / disable concurrent executions (UI label varies by n8n version)
4. Confirm the workflow toggle stays **Inactive**.
5. Click **Manual Trigger** → **Test workflow** / Execute.
6. Inspect **Load Config** output: `runId`, `mode: "manual"`, `config.sources`, `config.website.publishUrl`.

### Publish URL for cloud / staging

Default embed is `http://localhost:4000/api/summary`. For a deployed API:

```bash
WEBSITE_PUBLISH_BASE_URL=https://your-api.example.com \
  node workflows/scripts/generate-phase1-workflow.js
```

Then re-import (or paste the updated Load Config code).

### Regenerate after editing sources

```bash
node workflows/scripts/generate-phase1-workflow.js
```

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Manual Trigger emits config + run context | **Ready to verify** after import + manual execute in n8n Cloud |
| Schedule Trigger = `0 * * * *`, inactive | **Done** in exported JSON (`active: false`) |
| Config matches architecture (sources, caps, categories, website) | **Done** (from `config/sources.json`) |
| Concurrent executions disabled | **Set in n8n UI** after import (see step 3) |

## Out of scope this phase

- Gemini calls, RSS collection, publish to website (Phases 2–6)
- Activating the hourly schedule (Phase 8)
