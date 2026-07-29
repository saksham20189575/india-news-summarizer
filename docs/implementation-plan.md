# Implementation Plan: AI News Summarizer Agent for India

Phase-wise build plan for the system described in [`problemStatement.md`](./problemStatement.md) and [`architecture.md`](./architecture.md).

**End goal:** A production-ready **n8n workflow** that runs **every hour**, collects Indian news from 4–5 sources, categorizes and summarizes it with AI, and **publishes** the latest briefing JSON to a **website API** — plus a **frontend website** where people can open the page and read the summary.

**Out of scope:** Gmail / email delivery.

---

## Plan Overview

| Phase | Name | Focus | Outcome |
|-------|------|-------|---------|
| 0 | Foundations | Environment, credentials, repo layout | Ready to build n8n + website |
| 1 | Skeleton & Scheduler | Hourly trigger, config, run metadata | Workflow runs on demand and hourly |
| 2 | News Collection | Fetch + extract from sources | Canonical `Article[]` from multiple sites |
| 3 | Normalize & Deduplicate | Clean, dedupe, cap, empty-run guard | Stable corpus; never wipe site on empty |
| 4 | AI Processing | Categorize + summarize | Category-wise briefing object |
| 5 | Website API & Frontend | Store + display latest summary | Visitors can read `GET /api/summary` UI |
| 6 | Format & Publish | Briefing JSON → n8n HTTP publish | Site updates from n8n on each run |
| 7 | Hardening | Errors, retries, concurrency | Partial failures keep last good summary |
| 8 | Go-Live & Validation | Activate hourly schedule, acceptance | Hourly website refresh verified |
| 9 | Optional Extensions | History, filters, alerts | Post-v1 improvements |

**Recommended sequence:** Phases 0 → 8 in order. Phase 5 (website) can start in parallel with Phases 2–4 once the JSON contract is agreed. Phase 9 is optional after v1 success.

**Primary tools:** n8n (orchestration + publish), Cursor (parsers, prompts, Code-node JS, frontend), LLM provider API, website backend/API (no Gmail).

**Production deploy:** Railway (`api/`) + Vercel (`web/`) + n8n publish — see [`deployment-plan.md`](./deployment-plan.md).

**Data flow reminder:**

```text
n8n (hourly) ──PUT/POST /api/summary──▶ Website API (store latest)
Frontend     ──GET  /api/summary──────▶ Website API (read latest)
```

---

## Phase 0 — Foundations

**Objective:** Set up the environment so n8n and the website can be built and tested safely.

### Tasks

1. **Install / access n8n**
   - Local Docker/npm install, or cloud n8n instance.
   - Confirm you can create workflows and store credentials.
2. **Set instance timezone**
   - Prefer `Asia/Kolkata` for consistent `generatedAt` / “Last updated” labels.
3. **Create LLM credential**
   - OpenAI / Anthropic / Google (or whichever provider n8n AI nodes will use).
   - Smoke-test with a minimal LLM node.
4. **Choose website stack (v1)**
   - Pick one storage approach from architecture:
     - Simple file (`data/latest-summary.json`) + small API, or
     - Node/Express (or similar) API, or
     - Managed backend (Supabase / Firebase / KV).
   - Decide frontend framework (or static HTML + fetch) — keep v1 thin.
5. **Create publish API key**
   - Shared secret for n8n → `PUT/POST /api/summary` (env var; not committed).
6. **Repo / docs baseline**
   - Keep `docs/problemStatement.md`, `docs/architecture.md`, and this plan in sync.
   - Decide paths, e.g. `workflows/india-news-summarizer.json`, `web/` or `apps/web/`.
7. **Pick initial 4–5 sources** (from problem statement)

   | Source | URL |
   |--------|-----|
   | India Today | https://www.indiatoday.in/ |
   | NDTV | https://www.ndtv.com/india |
   | Times of India | https://timesofindia.indiatimes.com/india |
   | Hindustan Times | https://www.hindustantimes.com/india-news |
   | Indian Express | https://indianexpress.com/section/india/ |

8. **Discover RSS alternatives** where possible (preferred over HTML scraping).
9. **Freeze the briefing JSON contract** early (see architecture §4.6) so Phase 5 can proceed in parallel.

### Deliverables

- Working n8n instance with timezone set
- LLM credential verified
- Website stack choice documented
- Publish API key strategy defined
- Chosen source list + notes on RSS vs HTML per source
- Agreed `schemaVersion: 1` briefing JSON shape

### Exit criteria

- [ ] Can create and execute a trivial n8n workflow *(n8n Cloud — manual Gemini smoke-test; see `docs/phase0-decisions.md`)*
- [ ] LLM node returns a response *(Gemini credential in n8n Cloud — manual)*
- [x] Timezone decision documented (`Asia/Kolkata`)
- [x] Website stack + JSON contract chosen *(Next.js + Express; `contracts/briefing.schema.json`)*

### Dependencies / risks

- Some news sites may block naive scrapers — plan RSS-first.
- Website and n8n must share one JSON contract to avoid rework in Phase 6.

### Phase 0 implementation notes (repo)

Completed in-repo: decisions doc, RSS-first `config/sources.json`, frozen schema + fixtures, Express API scaffold (`api/`), Next.js scaffold (`web/`), publish key via `PUBLISH_API_KEY`. Remaining: complete n8n Cloud Gemini smoke-test manually.

---

## Phase 1 — Workflow Skeleton & Scheduler

**Objective:** Create the n8n workflow shell with hourly production and manual entry points, plus centralized config.

### Tasks

1. Create workflow: `India News Summarizer`.
2. Add **Schedule Trigger**
   - Cron: `0 * * * *` (every hour)
   - Timezone: `Asia/Kolkata`
   - Keep **Inactive** until Phase 8.
3. Add **Manual Trigger** (parallel entry for development).
4. Add **Set / Code — Run Context**
   - `runId` (UUID)
   - `runDate` (`YYYY-MM-DD`)
   - `triggeredAt` (ISO)
   - `mode`: `scheduled` | `manual`
5. Add **Config** node with:
   - `sources[]` (id, name, url, rssUrl, enabled)
   - `maxArticlesPerSource` (e.g. 8)
   - `maxArticlesTotal` (e.g. 40)
   - `website.publishUrl` and API key reference
   - `categories[]` (Politics, Sports, Business, Technology, Entertainment, Health, Education, Crime, Weather, World)
6. Wire Manual + Schedule → Run Context → Config → temporary “Done” stub.
7. Set workflow execution options: **disable concurrent executions**; size timeout for &lt; 1 hour.

### Deliverables

- Skeleton workflow with dual triggers and config
- Run metadata present on every execution

### Exit criteria

- [ ] Manual Trigger executes and emits config + run context *(verify after importing `workflows/india-news-summarizer.json` into n8n Cloud)*
- [x] Schedule Trigger configured as `0 * * * *` (not yet activated) *(`active: false` in export)*
- [x] Config matches architecture schema (including website publish settings)

### Dependencies / risks

- Overlapping hourly runs can double-publish — concurrency must be off before Go-Live.

### Phase 1 implementation notes (repo)

- Exported workflow: `workflows/india-news-summarizer.json`
- Generator (sync from `config/sources.json`): `workflows/scripts/generate-phase1-workflow.js`
- Import + concurrency UI steps: `docs/phase1-notes.md`
- Settings in JSON: timezone `Asia/Kolkata`, `executionTimeout: 3300`, inactive

---

## Phase 2 — News Collection Pipeline

**Objective:** Fetch and extract article candidates from each enabled source into the canonical article schema.

### Tasks

1. **Fan-out** over `sources[]` (Split Out / loop).
2. For each source:
   - Prefer **RSS Read** when `rssUrl` is set.
   - Else **HTTP Request** HTML from `url`.
3. Implement **Extract** (HTML Extract and/or Code node):
   - `title`, `url`, `publishedAt` (if available), `snippet` / short `content`, `sourceId`, `sourceName`
4. Generate stable `id` = hash(`sourceId` + canonical URL).
5. Enforce `maxArticlesPerSource` at extraction time.
6. Record **SourceStatus** (`success` | `failed`, error message, article count).
7. Use Cursor to write maintainable per-source parsers if layouts differ.
8. Merge all source outputs into one `Article[]` + `sourceStatuses[]`.

### Canonical article shape (must match architecture)

```json
{
  "id": "...",
  "sourceId": "ndtv_india",
  "sourceName": "NDTV",
  "title": "...",
  "url": "https://...",
  "publishedAt": "2026-07-26T06:30:00+05:30",
  "snippet": "...",
  "content": "...",
  "fetchedAt": "..."
}
```

### Deliverables

- Collection loop with isolated per-source handling
- Extracted `Article[]` from ≥ 3 working sources
- Source status list for `meta.failedSources` on the website payload

### Exit criteria

- [ ] Manual run returns articles from multiple sources *(verify after importing Phase 2 workflow into n8n Cloud; locally verified via `scripts/collect-news.js` — 5/5 sources)*
- [x] Fields required for AI (title, url, snippet/content, source) are populated
- [x] One intentionally broken URL does not stop other sources *(local `--broken` + n8n `continueOnFail`)*

### Dependencies / risks

- HTML structure changes → prefer RSS; keep parsers small and source-specific.
- Rate limits / blocks → add delays between requests if needed.

### Phase 2 implementation notes (repo)

- Exported workflow: `workflows/india-news-summarizer.json` (Phase 2 graph)
- Generator: `workflows/scripts/generate-phase2-workflow.js`
- Collection lib: `lib/collection/` (+ `n8nInline.js` embedded in Extract Articles)
- Local collector: `scripts/collect-news.js`
- Notes / import steps: `docs/phase2-notes.md`
- Fixed TOI India RSS to `-2128936835.cms` (previous id was World news)

---

## Phase 3 — Normalize, Deduplicate & Guards

**Objective:** Produce a clean, capped article corpus and protect the website from empty/failed runs.

### Tasks

1. **Normalize**
   - Trim text; decode HTML entities.
   - Strip tracking params (`utm_*`, etc.) from URLs.
   - Normalize timestamps to ISO-8601 / Asia/Kolkata when possible.
2. **Exact dedupe** on `url` / `id`.
3. **Near-duplicate dedupe** on title similarity (token overlap or simple distance).
   - Keep richest item (longer snippet, better timestamp, preferred source order).
4. Apply `maxArticlesTotal` cap (prefer newest when dates exist).
5. **Empty-run guard (IF node)**
   - If zero articles → **do not call LLM** and **do not overwrite** the website latest summary.
   - Log failure / run stats only.
6. Emit stats: `articleCount`, `dedupedCount`, `sourceSuccessCount` (for briefing `meta`).

### Deliverables

- Code node(s) for normalize / dedupe / cap
- Empty corpus branch that preserves last good website summary
- Run stats available for publisher metadata

### Exit criteria

- [x] Duplicate URLs/titles collapse as expected in a fixture run *(`fixtures/collection/articles_duplicates.json`)*
- [x] Caps respected
- [x] Empty corpus takes the guard path (no LLM, no publish overwrite) *(n8n IF → Empty Run Guard; local `--empty`)*

### Dependencies / risks

- Over-aggressive fuzzy dedupe may drop distinct stories — tune with real samples.

### Phase 3 implementation notes (repo)

- Exported workflow: `workflows/india-news-summarizer.json` (Phase 3 graph)
- Generator: `workflows/scripts/generate-phase3-workflow.js`
- Normalize lib: `lib/normalize/` (+ `n8nInline.js` embedded in Normalize & Dedupe)
- Local script: `scripts/normalize-articles.js`
- Notes: `docs/phase3-notes.md`
- Near-dup threshold: title Jaccard **0.72** (+ containment heuristic)

---

## Phase 4 — AI Categorization & Summarization

**Objective:** Turn the article corpus into a grounded, category-grouped briefing object.

### Tasks

#### Stage A — Categorize

1. Batch articles into an LLM / AI node (or loop in small batches).
2. Prompt: assign one category from the configured enum; optional `confidence` / `importance`.
3. Parse structured output (JSON).
4. Drop or down-rank very low-confidence items.
5. Attach `category` back onto each article.

#### Stage B — Summarize

1. Group articles by category (Code node).
2. For each non-empty category, call LLM to produce short bullets + source links.
3. Enforce prompt rules from the problem statement:
   - Only use provided content
   - No invented facts
   - Neutral, concise language
   - Include source title + URL
   - Avoid duplicate story bullets
4. Merge into an intermediate briefing object (categories + bullets + sources).
5. Iterate prompts in Cursor until quality is acceptable on sample runs.

### Deliverables

- Two-stage AI pipeline (or documented single-prompt fallback)
- Prompt templates (e.g. `prompts/categorize.md`, `prompts/summarize.md`)
- Structured category summaries ready for the canonical JSON formatter

### Exit criteria

- [x] Articles land in sensible categories on a real sample *(`scripts/process-ai.js --mock` + selftest; live Gemini after n8n `$vars.GEMINI_API_KEY`)*
- [x] Each category summary is short, factual, and includes source links *(sanitizer requires grounded URLs)*
- [x] Empty categories omitted
- [x] Model does not introduce facts absent from inputs (spot-check) *(invented URLs dropped; live faithfulness still manual)*

### Dependencies / risks

- Token limits → batch Stage A; truncate long `content` fields.
- Structured-output parsing failures → add validation + one retry.

### Phase 4 implementation notes (repo)

- Exported workflow: `workflows/india-news-summarizer.json` (Phase 4 graph)
- Generator: `workflows/scripts/generate-phase4-workflow.js`
- AI lib: `lib/ai/` (+ `n8nInline.js` embedded in **AI Categorize & Summarize**)
- Prompts: `prompts/categorize.md`, `prompts/summarize.md`
- Local script: `scripts/process-ai.js` (`--mock` or `GEMINI_API_KEY`)
- Notes: `docs/phase4-notes.md`
- n8n Variable: `$vars.GEMINI_API_KEY` (optional `$vars.AI_MOCK=true` for heuristic smoke-test)
- Model default: `gemini-3.5-flash-lite`; `minConfidence: 0.35`; one parse retry
- Rate limits (client-enforced): **15 RPM** (~4.2s gap), **250K TPM** (estimate), **500 RPD**; `maxRequestsPerRun: 16` keeps hourly under daily cap

---

## Phase 5 — Website API & Frontend

**Objective:** Build the website that stores the latest briefing and displays it to people.

Can start once the JSON contract from Phase 0 is frozen; finish enough of `GET`/`PUT` before Phase 6 wires n8n.

### Tasks

#### Backend / API

1. Implement **`PUT` or `POST /api/summary`**
   - Require API key / Bearer token.
   - Validate minimal shape (`schemaVersion`, `generatedAt`, `categories`).
   - Atomically replace the stored “latest” document.
2. Implement **`GET /api/summary`**
   - Return the latest stored JSON (public or shared-read as decided).
   - Return a clear empty/404 state if nothing has been published yet.
3. Choose and wire storage (file / DB / KV).
4. On failed validation, reject write without corrupting previous latest.

#### Frontend UI

1. Fetch `GET /api/summary` on load.
2. Render:
   - Title / brand for India news briefing
   - **Last updated** (`generatedAt`, Asia/Kolkata)
   - Category sections with bullets + clickable source links
   - Optional light note for partial source failures from `meta`
3. Handle empty / error states (“No summary yet”, “Temporarily unavailable”).
4. Make layout readable on desktop and mobile.
5. Optional: client refresh every N minutes, or copy that says “Updated hourly”.

### Deliverables

- Working API with authenticated write + read
- Frontend page rendering a fixture briefing JSON
- Seed/fixture file for local UI development without n8n

### Exit criteria

- [x] Manual `curl` PUT with API key stores a fixture briefing *(`api`: `npm run verify`)*
- [x] `GET /api/summary` returns that fixture
- [x] Frontend displays categories, sources, and last updated *(Bharat Brief / Stitch UI)*
- [x] Unauthorized PUT is rejected
- [x] Invalid PUT does not wipe previous good data

### Dependencies / risks

- CORS if frontend and API are on different origins — configure early.
- Do not expose the publish API key to the browser.

### Phase 5 implementation notes (repo)

- API: `api/` (`GET`/`PUT /api/summary`, AJV vs `contracts/briefing.schema.json`, atomic file store)
- Frontend: `web/` — Bharat Brief UI from `stitch_bharat_brief_news_reader/`
- Fixture seed: `fixtures/briefing_valid.json` → `npm run seed` in `api/`
- Verify: `api/scripts/verify-phase5.js` (`npm run verify`)
- Notes: `docs/phase5-notes.md`

---

## Phase 6 — Format & Publish (n8n → Website)

**Objective:** Assemble the canonical briefing JSON in n8n and publish it to the website API.

### Tasks

1. **Formatter (Code node)** — build canonical payload:

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "generatedAt": "...",
  "timezone": "Asia/Kolkata",
  "title": "India News Summary",
  "status": "ok",
  "meta": {
    "sourcesConfigured": 5,
    "sourcesSucceeded": 4,
    "articleCount": 28,
    "failedSources": []
  },
  "categories": []
}
```

2. Optional Markdown dump for n8n execution logs / debugging only.
3. **HTTP Request — Publish**
   - Method: `PUT` or `POST` to `website.publishUrl`
   - Header: API key / Bearer token
   - Body: briefing JSON
4. Publish only when `status: "ok"` and at least one category exists.
5. On publish HTTP failure: retry with backoff; fail the execution; leave previous website summary intact.
6. End-to-end manual test: Manual Trigger → collection → AI → publish → refresh frontend.

### Deliverables

- Formatter producing architecture-compliant JSON
- n8n publisher node wired and authenticated
- Verified manual update visible on the website

### Exit criteria

- [ ] Manual n8n run updates what the frontend shows
- [ ] Source links on the site open correct articles
- [ ] Failed publish does not clear the previous briefing
- [ ] No full article bodies stored or displayed on the site

### Dependencies / risks

- Phase 5 API must be reachable from the n8n host (localhost vs deployed URL).
- Clock skew: use n8n/`$now` for `generatedAt` consistently.

---

## Phase 7 — Hardening & Observability

**Objective:** Make hourly runs resilient so visitors keep a last-good briefing when something fails.

### Tasks

1. **Per-source isolation** — collection errors caught; others continue; `meta.failedSources` populated.
2. **HTTP retries** for news fetches (transient 5xx/timeouts only).
3. **LLM retries** — one retry on parse/timeout; on persistent failure, **do not overwrite** website.
4. **Publish retries** — short backoff; then fail execution without wiping storage.
5. **Concurrency** — confirm concurrent executions disabled.
6. **Execution timeout** — sized for fetch + 2 AI stages, under one hour.
7. **Logging** — `runId`, counts, and failure reasons visible in n8n execution data.
8. **Copyright / size guard** — truncate content sent to the LLM; never publish full scraped HTML.

### Deliverables

- Error branches and retries documented in the workflow
- “Keep last good summary” behavior tested for empty corpus, LLM failure, and publish failure
- Execution settings tuned

### Exit criteria

- [ ] Killing one source still produces a publishable briefing from the rest
- [ ] Simulated empty / LLM / publish failure leaves previous UI content intact
- [ ] No overlapping double-publishes under slow runs

### Dependencies / risks

- Over-retrying can amplify rate limits — keep retries small.

---

## Phase 8 — Go-Live & Acceptance

**Objective:** Activate the hourly scheduler and prove the problem-statement success criteria.

### Pre-activation checklist

- [ ] Timezone = `Asia/Kolkata`
- [ ] Cron = `0 * * * *`
- [ ] Website `publishUrl` points to production/staging API
- [ ] Publish API key configured in n8n
- [ ] Concurrent executions disabled
- [ ] At least 4 sources enabled and recently successful
- [ ] Manual end-to-end run updated the live website
- [ ] Frontend deployed and loading `GET /api/summary`

### Tasks

1. Activate the n8n workflow.
2. Confirm the next hourly fire publishes a new `generatedAt` on the site (or temporarily use a near-term cron to validate, then restore `0 * * * *`).
3. Run acceptance against problem-statement success criteria:

   | Criterion | How to verify |
   |-----------|---------------|
   | Fetch from multiple Indian sites | `meta.sourcesSucceeded` ≥ 2 |
   | Extract articles correctly | Titles/URLs on site match real pages |
   | Categorize meaningfully | Spot-check 5–10 bullets vs category |
   | Clear concise summaries | Readable in a few minutes |
   | Source links | Links open correct articles |
   | Automatic hourly schedule | `generatedAt` advances without manual trigger |
   | Website display | Visitors can open the site and read the briefing |

4. Export workflow JSON into the repo.
5. Document API contract, env vars, and timezone in a short README (when added).

### Deliverables

- Active production workflow
- First verified hourly website update
- Exported workflow artifact + deployed website
- Acceptance sign-off

### Exit criteria

- [ ] Hourly publish observed on the website
- [ ] All success criteria checked
- [ ] Workflow JSON exported

### Dependencies / risks

- If n8n was down for an hour, the next successful run is enough for v1 (no backfill required).

---

## Phase 9 — Optional Extensions (Post-v1)

Implement only after Phase 8 is stable.

| Extension | Work | Value |
|-----------|------|-------|
| Summary history | Store last N hourly snapshots; UI “earlier today” | Browse past hours |
| Category filters / tabs | Frontend filters | Faster scanning |
| Importance ranking | Use AI `importance` to limit bullets | Shorter digests |
| Per-source parser modules | Maintainable extractors in repo | Survive site redesigns |
| Slack / Telegram notify | Optional alert on publish success/failure | Ops awareness |
| Failure monitoring | Alert on N consecutive failed hours | Reliability |
| CDN / short cache on GET | Cache `GET /api/summary` briefly | Traffic spikes |

---

## Cross-Phase Workstreams (Cursor Support)

| Workstream | Phases | Examples |
|------------|--------|----------|
| Parsers | 2, 7, 9 | HTML/RSS extractors, URL canonicalization |
| Prompts | 4 | Categorize + summarize prompt iteration |
| Glue code | 1–6 | Dedupe, grouping, briefing JSON formatter |
| Website | 0, 5, 6 | API routes, frontend UI, empty states |
| Debugging | All | HTTP payloads, LLM JSON parse errors, publish auth |
| Docs | 0, 8 | Keep architecture / plan / README aligned |

---

## Suggested Timeline (Indicative)

Assuming part-time build (~few hours/day):

| Phase | Indicative effort |
|-------|-------------------|
| 0 Foundations | 0.5–1 day |
| 1 Skeleton & Scheduler | 0.5 day |
| 2 Collection | 1–2 days |
| 3 Normalize & Dedupe | 0.5–1 day |
| 4 AI Processing | 1–2 days |
| 5 Website API & Frontend | 1–2 days (parallelizable with 2–4) |
| 6 Format & Publish | 0.5–1 day |
| 7 Hardening | 0.5–1 day |
| 8 Go-Live | 0.5 day (+ 1–2 hourly confirmations) |

**Rough v1 total:** ~6–11 working days, depending on scraping difficulty and website stack choice.

---

## Definition of Done (v1)

The project is done when:

1. The n8n workflow is **Active** with cron `0 * * * *`.
2. It collects from **multiple configured Indian news sources**.
3. It produces a **category-grouped summary with source links**.
4. It **publishes** the canonical briefing JSON to the website API each successful hour.
5. The **frontend** displays the latest summary (categories, sources, last updated) for visitors.
6. Empty corpus, LLM, or publish failures **do not wipe** the last good summary.
7. Email/Gmail is **not** required.
8. Workflow export and docs reflect the shipped behavior.

---

## Phase Dependency Graph

```text
Phase 0 Foundations
    │
    ├──────────────────────────────┐
    ▼                              ▼
Phase 1 Skeleton & Scheduler    Phase 5 Website API & Frontend
    │                              │  (can start after JSON contract)
    ▼                              │
Phase 2 News Collection            │
    │                              │
    ▼                              │
Phase 3 Normalize & Deduplicate    │
    │                              │
    ▼                              │
Phase 4 AI Processing              │
    │                              │
    └──────────────┬───────────────┘
                   ▼
            Phase 6 Format & Publish
                   │
                   ▼
            Phase 7 Hardening
                   │
                   ▼
            Phase 8 Go-Live & Validation
                   │
                   ▼
            Phase 9 Extensions (optional)
```
