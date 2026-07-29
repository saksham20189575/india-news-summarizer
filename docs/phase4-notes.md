# Phase 4 — AI Categorization & Summarization

Importable n8n Cloud workflow for Phase 4 of [`implementation-plan.md`](./implementation-plan.md).

## Artifacts

| File | Purpose |
|------|---------|
| [`../workflows/india-news-summarizer.json`](../workflows/india-news-summarizer.json) | Import into n8n Cloud |
| [`../workflows/scripts/generate-phase4-workflow.js`](../workflows/scripts/generate-phase4-workflow.js) | Regenerate workflow |
| [`../lib/ai/`](../lib/ai/) | Categorize / summarize / Gemini client (+ `n8nInline.js`) |
| [`../prompts/categorize.md`](../prompts/categorize.md) | Stage A prompt template |
| [`../prompts/summarize.md`](../prompts/summarize.md) | Stage B prompt template |
| [`../scripts/process-ai.js`](../scripts/process-ai.js) | Local mock or live Gemini run |
| [`../fixtures/ai/`](../fixtures/ai/) | Sample articles + intermediate briefing |

## Graph

```text
… Normalize & Dedupe
        │
        ▼
IF Articles Exist?
   │yes                                      │no
   ▼                                         ▼
AI Categorize & Summarize           Empty Run Guard → End Empty Run
   │                                (no LLM, no publish)
   ▼
IF Briefing Ready?
   │yes                          │no
   ▼                             ▼
Done (Phase 4 stub)     AI Failed Guard → End AI Fail
(categories ready       (no publish overwrite)
 for Phase 6)
```

Two stages run inside **AI Categorize & Summarize**:

1. **Stage A** — batch articles → Gemini JSON assignments → attach `category` / `confidence` / `importance`; drop low confidence (&lt; `minConfidence`)
2. **Stage B** — group by category → Gemini bullets per non-empty group → drop invented URLs → omit empty categories

## n8n Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes (production) | Read as `$vars.GEMINI_API_KEY` in the AI Code node |
| `AI_MOCK` | No | Set `true` (`$vars.AI_MOCK`) to force heuristic mock (dev only) |

Create them in n8n Cloud: **Settings → Variables** (not `.env` / `$env`).

If `$vars.GEMINI_API_KEY` is missing, the Code node falls back to the heuristic mock (graph smoke-tests only — **not** for quality).

**Model:** `gemini-3.5-flash-lite` (`thinkingLevel: minimal`)

**Quota (client-enforced in Code node / `lib/ai`):**

| Limit | Value | How we stay under it |
|-------|-------|----------------------|
| Requests / minute | 15 | ≥ **4200ms** gap between Gemini calls |
| Tokens / minute | 250K | Estimate tokens before each call; wait if window full |
| Requests / day | 500 | Cap **16 requests/run** (hourly ≈ 384/day); skip lower-priority categories if budget tight |
| HTTP 429 | — | Backoff (~4s × attempt) and one retry |

With `maxArticlesTotal: 10` and batch size 10, a normal run is **1 categorize + ≤N summarize** (usually well under 16).

## Intermediate output shape

```json
{
  "runId": "uuid",
  "articles": [{ "id": "...", "category": "Education", "confidence": 0.9 }],
  "categories": [
    {
      "category": "Education",
      "bullets": [
        {
          "summary": "Short factual bullet",
          "sources": [{ "title": "...", "url": "https://..." }]
        }
      ]
    }
  ],
  "ai": {
    "model": "gemini-3.5-flash-lite",
    "thinkingLevel": "minimal",
    "categorizedCount": 8,
    "summarizedCategories": 4,
    "errors": [],
    "categorizeStats": {},
    "summarizeStats": []
  },
  "guard": {
    "proceed": true,
    "skipPublish": false
  },
  "phase": "phase4-ai"
}
```

Canonical `schemaVersion: 1` wrapper (runId / meta / timezone title) is **Phase 6**.

## Local verification

```bash
node lib/ai/selftest.js

# Offline mock (no API key)
node scripts/process-ai.js --mock --out fixtures/ai/briefing_intermediate.json

# Live collect → normalize → Gemini (needs GEMINI_API_KEY)
GEMINI_API_KEY=... node scripts/process-ai.js --live --out fixtures/ai/briefing_live.json
```

## Import into n8n Cloud

1. Import `workflows/india-news-summarizer.json` (replace prior Phase 3 import).
2. Add n8n Variable **`GEMINI_API_KEY`** (Settings → Variables) — used as `$vars.GEMINI_API_KEY`.
3. Settings: timezone `Asia/Kolkata`, timeout `3300s`, **one execution at a time**.
4. Keep **Inactive**.
5. Manual Trigger → inspect **AI Categorize & Summarize** (`categories`, `ai`) and confirm **IF Briefing Ready** takes the true branch.

### Optional mock path

Temporarily set Variable `AI_MOCK=true` (`$vars.AI_MOCK`) to exercise the graph without Gemini quota.

## Regenerate

```bash
WEBSITE_PUBLISH_BASE_URL=http://localhost:4000 \
  node workflows/scripts/generate-phase4-workflow.js
```

Keep `lib/ai/*.js` and `lib/ai/n8nInline.js` in sync when changing AI glue.

## Exit criteria

| Criterion | Status |
|-----------|--------|
| Articles land in sensible categories on a sample | **Done** locally (`--mock` + selftest); spot-check live Gemini after import |
| Each category summary short + source links | **Done** (sanitizer enforces ≥1 grounded URL per bullet) |
| Empty categories omitted | **Done** (`mergeBriefingCategories`) |
| Model does not invent URLs | **Done** (invented URLs dropped in sanitize) |
| Malformed JSON recovery | **Done** (one retry; mock fallback when `$vars.AI_MOCK` / no key) |

## Out of scope this phase

- Canonical briefing JSON formatter + website publish (Phase 6)
- Website UI (Phase 5)
- Activating hourly schedule (Phase 8)
- Full LLM failure hardening (Phase 7; AI Failed Guard is the minimal keep-last-good path)
