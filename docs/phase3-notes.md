# Phase 3 — Normalize, Deduplicate & Guards

Importable n8n Cloud workflow for Phase 3 of [`implementation-plan.md`](./implementation-plan.md).

## Artifacts

| File | Purpose |
|------|---------|
| [`../workflows/india-news-summarizer.json`](../workflows/india-news-summarizer.json) | Import into n8n Cloud |
| [`../workflows/scripts/generate-phase3-workflow.js`](../workflows/scripts/generate-phase3-workflow.js) | Regenerate workflow |
| [`../lib/normalize/`](../lib/normalize/) | Normalize / dedupe / cap (Node + `n8nInline.js`) |
| [`../scripts/normalize-articles.js`](../scripts/normalize-articles.js) | Local corpus builder |
| [`../fixtures/collection/articles_duplicates.json`](../fixtures/collection/articles_duplicates.json) | Exact + near-dup + cap fixture |
| [`../fixtures/collection/normalized.json`](../fixtures/collection/normalized.json) | Sample live normalized corpus |

## Graph

```text
… Load Config
        │
        ▼
Collect All Sources   (maxArticlesPerSource=2; isolated httpRequest per source)
        │
        ▼
Normalize & Dedupe
        │
        ▼
IF Articles Exist?
   │yes                          │no
   ▼                             ▼
Done (Phase 3 stub)     Empty Run Guard → End Empty Run
(ready for Phase 4 AI)  (no LLM, no publish overwrite)
```

Upstream: Manual/Schedule → Run Context → Config → **Collect All Sources** (replaces the old Prepare/Fetch/Extract/Merge fan-out, which could mis-label every item as the first source in n8n).

## What Normalize & Dedupe does

1. **Normalize** — trim + decode entities; strip tracking query params; timestamps → `Asia/Kolkata` ISO (`+05:30`)
2. **Exact dedupe** — same canonical `url` (or `id`); keep richest (snippet/content length, timestamp, source order)
3. **Near-dedupe** — title token Jaccard (≥ 0.72) + containment heuristic; prefer over-dropping duplicates
4. **Cap** — `maxArticlesTotal` (default 40), newest `publishedAt` first
5. **Guard flags** — `guard.proceed`, `skipLlm`, `skipPublish` when `articleCount === 0`

## Output shape (after Normalize & Dedupe)

```json
{
  "runId": "uuid",
  "articles": [/* cleaned, deduped, capped */],
  "sourceStatuses": [],
  "collection": {},
  "corpus": {
    "rawCount": 40,
    "normalizedCount": 40,
    "exactDedupedCount": 0,
    "nearDedupedCount": 1,
    "dedupedCount": 1,
    "cappedCount": 0,
    "articleCount": 39,
    "sourceSuccessCount": 5,
    "sourceFailedCount": 0,
    "failedSources": [],
    "nearDuplicateThreshold": 0.72,
    "maxArticlesTotal": 40
  },
  "guard": {
    "proceed": true,
    "reason": null,
    "skipLlm": false,
    "skipPublish": false
  },
  "articleCount": 39,
  "dedupedCount": 1,
  "sourceSuccessCount": 5,
  "phase": "phase3-normalize"
}
```

Empty path (`Empty Run Guard`) sets `outcome: "skipped_llm_and_publish"` and keeps `skipPublish: true`.

## Local verification

```bash
node lib/normalize/selftest.js

# Fixture: exact URL + near title + cap
node scripts/normalize-articles.js

# Empty guard
node scripts/normalize-articles.js --empty

# Live collect → normalize
node scripts/normalize-articles.js --live --out fixtures/collection/normalized.json
```

## Import into n8n Cloud

1. Import `workflows/india-news-summarizer.json` (replace prior Phase 2 import).
2. Settings: timezone `Asia/Kolkata`, timeout `3300s`, **one execution at a time**.
3. Keep **Inactive**.
4. Manual Trigger → inspect **Normalize & Dedupe** (`corpus`, `guard`) and confirm **IF Articles Exist** takes the true branch when articles exist.

### Optional empty-path check

Temporarily force empty articles (e.g. pin empty data on Merge Collection, or disable all sources) and confirm execution ends at **End Empty Run** with `skipPublish: true`.

## Regenerate

```bash
WEBSITE_PUBLISH_BASE_URL=http://localhost:4000 \
  node workflows/scripts/generate-phase3-workflow.js
```

Keep `lib/normalize/*.js` and `lib/normalize/n8nInline.js` in sync when changing dedupe logic.

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Duplicate URLs/titles collapse in fixture run | **Done** (`articles_duplicates.json` + selftest) |
| Caps respected | **Done** (`maxArticlesTotal`) |
| Empty corpus takes guard path (no LLM, no publish) | **Done** locally (`--empty`); n8n IF → Empty Run Guard |

## Out of scope this phase

- Gemini categorize / summarize (Phase 4)
- Website publish (Phases 5–6)
- Activating hourly schedule (Phase 8)
