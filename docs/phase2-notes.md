# Phase 2 — News Collection Pipeline

Importable n8n Cloud workflow for Phase 2 of [`implementation-plan.md`](./implementation-plan.md).

## Artifacts

| File | Purpose |
|------|---------|
| [`../workflows/india-news-summarizer.json`](../workflows/india-news-summarizer.json) | Import into n8n Cloud |
| [`../workflows/scripts/generate-phase2-workflow.js`](../workflows/scripts/generate-phase2-workflow.js) | Regenerate workflow from `config/sources.json` + `lib/collection/n8nInline.js` |
| [`../lib/collection/`](../lib/collection/) | Testable RSS/HTML extractors (Node) |
| [`../scripts/collect-news.js`](../scripts/collect-news.js) | Local live collection (no n8n required) |
| [`../fixtures/collection/latest.json`](../fixtures/collection/latest.json) | Sample `Article[]` + `sourceStatuses[]` from a live run |

## Graph

```text
Manual Trigger ──▶ Set Mode Manual ────┐
                                       ├──▶ Build Run Context ──▶ Load Config
Schedule Trigger ─▶ Set Mode Scheduled ┘              │
   cron: 0 * * * *                                   ▼
   active: false                          Prepare Sources (fan-out)
                                                     │
                                                     ▼
                                          Fetch Source Feed (HTTP, continueOnFail)
                                                     │
                                                     ▼
                                          Extract Articles (RSS/HTML → Article[])
                                                     │
                                                     ▼
                                          Merge Collection ──▶ Done (Phase 2 stub)
```

## Output shape (after Merge Collection)

```json
{
  "runId": "uuid",
  "runDate": "YYYY-MM-DD",
  "triggeredAt": "ISO-8601",
  "mode": "manual | scheduled",
  "timezone": "Asia/Kolkata",
  "config": { "...": "..." },
  "articles": [
    {
      "id": "sha256(sourceId|canonicalUrl).slice(0,24)",
      "sourceId": "ndtv_india",
      "sourceName": "NDTV",
      "title": "...",
      "url": "https://...",
      "publishedAt": "2026-07-26T06:30:00.000Z",
      "snippet": "...",
      "content": "...",
      "fetchedAt": "..."
    }
  ],
  "sourceStatuses": [
    {
      "sourceId": "ndtv_india",
      "sourceName": "NDTV",
      "fetchMode": "rss",
      "fetchUrl": "https://...",
      "statusCode": 200,
      "status": "success | failed",
      "error": null,
      "articleCount": 8
    }
  ],
  "collection": {
    "sourcesConfigured": 5,
    "sourcesEnabled": 5,
    "sourcesSucceeded": 5,
    "sourcesFailed": 0,
    "articleCount": 40,
    "failedSources": []
  },
  "phase": "phase2-collection"
}
```

## Local verification (recommended before n8n import)

```bash
# Unit (fixture RSS, no network)
node lib/collection/selftest.js

# Live fetch all enabled sources
node scripts/collect-news.js --out fixtures/collection/latest.json

# Prove one broken URL does not stop others
node scripts/collect-news.js --broken
```

Expect ≥ 3 successful sources and `maxArticlesPerSource` (8) per success.

## Import into n8n Cloud

1. Open n8n Cloud → **Workflows** → **Import from File** (replace prior Phase 1 import if present).
2. Select `workflows/india-news-summarizer.json`.
3. Workflow settings:
   - Timezone = `Asia/Kolkata`
   - Timeout = `3300` seconds
   - **One execution at a time** / disable concurrent executions
4. Keep workflow **Inactive**.
5. **Manual Trigger** → Execute.
6. Inspect **Merge Collection** output:
   - `articles.length` > 0 from multiple `sourceId`s
   - each article has `title`, `url`, `snippet`/`content`, `sourceName`
   - `sourceStatuses` lists success/failed with counts

### Optional isolation check in n8n

Temporarily set one source `rssUrl` in **Load Config** to an invalid host, re-run, confirm other sources still produce articles and the bad source is `status: "failed"`.

## Regenerate after editing sources or parsers

```bash
# optional: point publish URL at a deployed API
WEBSITE_PUBLISH_BASE_URL=https://your-api.example.com \
  node workflows/scripts/generate-phase2-workflow.js
```

Keep `lib/collection/*.js` and `lib/collection/n8nInline.js` in sync when changing parse/extract logic (generator embeds `n8nInline.js` into the Extract Articles node).

## Source notes (Phase 2)

| Source | Mode | Notes |
|--------|------|-------|
| India Today | RSS | `rss/1206578` |
| NDTV | RSS | Feedburner India news |
| Times of India | RSS | **`-2128936835.cms`** (India). Do not use `296589292.cms` (World). |
| Hindustan Times | RSS | India-news feed |
| Indian Express | RSS | Descriptions often empty → snippet falls back to title |

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Manual run returns articles from multiple sources | **Ready to verify** in n8n after import; **verified locally** via `scripts/collect-news.js` (5/5 sources) |
| Fields for AI populated (title, url, snippet/content, source) | **Done** in extractor (+ title fallback for empty descriptions) |
| One broken URL does not stop other sources | **Verified** with `--broken`; n8n uses `continueOnFail` / `onError: continueRegularOutput` |

## Out of scope this phase

- Normalize / fuzzy dedupe / empty-run guard (Phase 3)
- Gemini categorize/summarize (Phase 4)
- Website publish (Phases 5–6)
- Activating the hourly schedule (Phase 8)
