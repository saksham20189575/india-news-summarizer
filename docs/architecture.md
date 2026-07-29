# Architecture: AI News Summarizer Agent for India

## 1. Purpose

This document defines the system architecture for an **n8n-based AI agent** plus a **frontend website** that:

1. Collects the latest news from selected Indian news websites.
2. Extracts, deduplicates, categorizes, and summarizes articles.
3. Publishes a structured briefing to a website backend/API.
4. Displays the **latest summary** on a frontend so people can read it in a browser.
5. Refreshes automatically **every hour** via a scheduler.

It is the technical companion to [`problemStatement.md`](./problemStatement.md) and is intended to guide implementation in n8n and a small web app (with Cursor used for parsers, prompts, Function-node code, and the frontend).

**Out of scope:** Gmail / email delivery. No Google OAuth for mail is required.

---

## 2. Goals and Non-Goals

### 2.1 Goals

| Goal | Description |
|------|-------------|
| Multi-source collection | Fetch latest articles from 4–5 configurable Indian news URLs |
| Reliable extraction | Capture title, URL, publish time, snippet/body, and source name |
| Categorization | Classify into Politics, Sports, Business, Technology, Entertainment, Health, Education, Crime, Weather/Environment, World |
| Summarization | Produce short, neutral, category-grouped summaries with source links |
| Hourly refresh | Run automatically **every hour** and update the latest summary |
| Website display | Serve the latest briefing on a frontend website for visitors |
| Operability | Handle broken sources, empty categories, and partial failures without corrupting the published briefing |

### 2.2 Non-Goals

- Email / Gmail / newsletter delivery (explicitly dropped)
- Full-article archival or republication of copyrighted content
- Sub-hourly / real-time streaming (hourly is the v1 cadence)
- Personalized recommendations or user preference learning (v1)
- Multi-channel sinks such as Slack/Telegram (optional later)

---

## 3. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        n8n Workflow Orchestrator                        │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────────┐  │
│  │  Scheduler   │──▶│  Config      │──▶│  News Collection Pipeline   │  │
│  │  (Every hour)│   │  (Sources)   │   │  HTTP / RSS / Parse         │  │
│  └──────────────┘   └──────────────┘   └──────────────┬──────────────┘  │
│                                                       │                 │
│                                                       ▼                 │
│                                         ┌─────────────────────────────┐ │
│                                         │  Normalize & Deduplicate    │ │
│                                         └──────────────┬──────────────┘ │
│                                                        │                │
│                                                        ▼                │
│                                         ┌─────────────────────────────┐ │
│                                         │  AI Processing Layer        │ │
│                                         │  Categorize → Summarize     │ │
│                                         └──────────────┬──────────────┘ │
│                                                        │                │
│                                                        ▼                │
│                                         ┌─────────────────────────────┐ │
│                                         │  Formatter                  │ │
│                                         │  Briefing JSON (+ Markdown) │ │
│                                         └──────────────┬──────────────┘ │
│                                                        │                 │
│                                                        ▼                 │
│                                         ┌─────────────────────────────┐ │
│                                         │  Website Publisher          │ │
│                                         │  HTTP PUT/POST to API       │ │
│                                         └──────────────┬──────────────┘ │
└───────────────────────────────────────────┬─────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Website Application (to be built)                   │
│                                                                         │
│  ┌──────────────────────┐              ┌────────────────────────────┐   │
│  │  Backend / API       │◀─────────────│  Storage                   │   │
│  │  POST/PUT latest     │   read       │  latest briefing JSON      │   │
│  │  GET  /api/summary   │─────────────▶│  (file, DB, or KV)         │   │
│  └──────────┬───────────┘              └────────────────────────────┘   │
│             │                                                           │
│             ▼                                                           │
│  ┌──────────────────────┐                                               │
│  │  Frontend UI         │  Visitors open the site and see               │
│  │  Category sections,  │  the latest India news summary                │
│  │  sources, updatedAt  │                                               │
│  └──────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────┘

External systems:
  • News sites / RSS feeds
  • LLM provider (OpenAI / Anthropic / Google / etc. via n8n AI nodes)
  • Website API (authenticated write from n8n; public or shared read for UI)
```

### 3.1 Design Principles

1. **Orchestration in n8n** — collection, AI, and publish live in n8n.
2. **Website is the product surface** — people consume summaries in the browser, not email.
3. **Hourly, mostly independent runs** — each hour regenerates and publishes the latest briefing; no long-lived agent memory required for v1.
4. **Source isolation** — one failing news site must not abort the whole run.
5. **Grounded AI** — the model only summarizes provided article payloads; it must not invent facts.
6. **Safe publish** — prefer atomic replace of “latest summary” so visitors never see a half-written payload; on total AI failure, keep the previous successful briefing on the site when possible.

---

## 4. Component Architecture

### 4.1 Scheduler Component (Primary Trigger)

**Responsibility:** Start the news pipeline every hour and optionally allow manual/test runs.

| Property | Value |
|----------|--------|
| Component | n8n **Schedule Trigger** (Cron) |
| Schedule | **Every hour** |
| Recommended cron | `0 * * * *` |
| Timezone | Explicitly set in n8n (e.g. `Asia/Kolkata`) for consistent `updatedAt` labels |
| Secondary trigger | Manual Trigger node for development and dry-runs |

**Scheduler behavior:**

```text
Cron fires (top of every hour)
        │
        ▼
Inject run metadata:
  - runId (UUID)
  - runDate (YYYY-MM-DD)
  - triggeredAt (ISO timestamp)
  - mode = "scheduled" | "manual"
        │
        ▼
Hand off to Config Loader
```

**Notes:**

- Use a single Schedule Trigger as the production entry point.
- Keep Manual Trigger wired in parallel so developers can re-run without waiting for the next hour.
- Disable concurrent executions: if a run still exceeds ~60 minutes, skip overlapping fires rather than double-publishing.

### 4.2 Configuration Component

**Responsibility:** Centralize news sources, limits, website publish settings, and AI parameters.

Suggested structure (n8n Set / Code node, or n8n static data / env vars):

```json
{
  "runDate": "{{ $now.toFormat('yyyy-MM-dd') }}",
  "timezone": "Asia/Kolkata",
  "maxArticlesPerSource": 8,
  "maxArticlesTotal": 40,
  "website": {
    "publishUrl": "https://your-app.example.com/api/summary",
    "apiKeyEnv": "WEBSITE_PUBLISH_API_KEY"
  },
  "sources": [
    {
      "id": "india_today",
      "name": "India Today",
      "type": "html_or_rss",
      "url": "https://www.indiatoday.in/",
      "rssUrl": null,
      "enabled": true
    },
    {
      "id": "ndtv_india",
      "name": "NDTV",
      "type": "html_or_rss",
      "url": "https://www.ndtv.com/india",
      "rssUrl": null,
      "enabled": true
    },
    {
      "id": "toi_india",
      "name": "Times of India",
      "type": "html_or_rss",
      "url": "https://timesofindia.indiatimes.com/india",
      "rssUrl": null,
      "enabled": true
    },
    {
      "id": "ht_india",
      "name": "Hindustan Times",
      "type": "html_or_rss",
      "url": "https://www.hindustantimes.com/india-news",
      "rssUrl": null,
      "enabled": true
    },
    {
      "id": "ie_india",
      "name": "Indian Express",
      "type": "html_or_rss",
      "url": "https://indianexpress.com/section/india/",
      "rssUrl": null,
      "enabled": true
    }
  ],
  "categories": [
    "Politics",
    "Sports",
    "Business",
    "Technology",
    "Entertainment",
    "Health",
    "Education",
    "Crime",
    "Weather",
    "World"
  ]
}
```

Prefer **RSS when available**; fall back to HTML scraping only when necessary.

### 4.3 News Collection Pipeline

**Responsibility:** Fetch content from each enabled source and extract article candidates.

#### Subcomponents

| Subcomponent | n8n building blocks | Role |
|--------------|---------------------|------|
| Source fan-out | SplitInBatches / Loop Over Items | Process each source independently |
| Fetch | HTTP Request / RSS Read | Download HTML or RSS/Atom |
| Extract | HTML Extract / Code (Cheerio-like JS) | Pull titles, links, snippets, dates |
| Enrich (optional) | HTTP Request per article | Fetch article body when only a teaser is available |
| Source status | Set / Code | Record success/failure per source for website metadata |

#### Canonical article schema

Every extracted item must normalize to:

```json
{
  "id": "hash(sourceId + canonicalUrl)",
  "sourceId": "ndtv_india",
  "sourceName": "NDTV",
  "title": "Article title",
  "url": "https://...",
  "publishedAt": "2026-07-26T06:30:00+05:30",
  "snippet": "Short excerpt or lead paragraph",
  "content": "Optional longer extracted text (truncated)",
  "fetchedAt": "2026-07-26T11:00:05+05:30"
}
```

#### Collection rules

- Cap articles per source (`maxArticlesPerSource`) and overall (`maxArticlesTotal`).
- Prefer newest items when timestamps exist; otherwise keep DOM/RSS order and trim.
- Strip ads, nav text, related-widget junk before AI input.
- On HTTP 4xx/5xx/timeout: mark source as failed, continue with remaining sources.
- Do not store full copyrighted articles long-term; keep only what is needed for the current run (plus the published summary JSON).

### 4.4 Normalize & Deduplicate

**Responsibility:** Clean and collapse near-duplicate coverage of the same story across outlets.

#### Steps

1. **Normalize**
   - Trim whitespace; decode HTML entities.
   - Canonicalize URLs (strip tracking params such as `utm_*`).
   - Normalize publish times to ISO-8601 in `Asia/Kolkata` when possible.
2. **Exact dedupe**
   - Drop identical `url` or identical `id`.
3. **Near-duplicate dedupe**
   - Fuzzy match on title similarity (e.g. normalized Levenshtein / token overlap).
   - Keep the richest item (longer snippet/content, better timestamp, preferred source order).
4. **Empty-run guard**
   - If zero articles remain after collection, **do not overwrite** a previously good website briefing.
   - Log failure / optionally publish a status flag without clearing categories (policy: keep last good summary).

### 4.5 AI Processing Layer

**Responsibility:** Categorize articles and produce category-wise summaries grounded only in provided content.

#### Recommended flow (two-stage)

```text
Articles[] ──▶ Stage A: Categorize (+ optional importance score)
                    │
                    ▼
              Group by category
                    │
                    ▼
            Stage B: Summarize per category
                    │
                    ▼
              Merged briefing object
```

**Why two stages?** Categorization is more reliable when done per article; summarization is clearer when done per category group. A single mega-prompt is allowed as a simpler alternative, but two-stage is preferred for quality and debugging.

#### Stage A — Categorization

Input: article title, snippet/content, source name.  
Output per article:

```json
{
  "articleId": "...",
  "category": "Politics",
  "confidence": 0.86,
  "importance": 0.7
}
```

Rules:

- Force category to one of the configured enum values (plus optional `Other` that is omitted from the website if empty/noisy).
- Discard or down-rank items with very low confidence.
- Never invent facts during this stage.

#### Stage B — Summarization

Input: all articles in one category.  
Output:

```json
{
  "category": "Politics",
  "bullets": [
    {
      "summary": "Short factual bullet",
      "sources": [
        { "title": "Article title", "url": "https://..." }
      ]
    }
  ]
}
```

Rules (aligned with the problem statement):

- Use only provided article text.
- Keep bullets short and factual; neutral tone; no sensationalism.
- Include source links.
- Avoid duplicating the same story across bullets.
- Skip empty categories in the final output.

#### Prompt contract

Prompts should explicitly instruct the model to:

1. Summarize only provided content.
2. Group by category.
3. Keep summaries short and factual.
4. Include sources.
5. Avoid hallucination, ads/nav noise, and political bias.

Cursor may be used to iterate on these prompts and on Function-node glue code.

### 4.6 Formatter Component

**Responsibility:** Turn the AI briefing object into the canonical JSON payload the website stores and renders.

#### Outputs produced

| Format | Use |
|--------|-----|
| Briefing JSON | **Primary** — published to website API / storage |
| Markdown | Intermediate / logging / optional debug view |

#### Canonical briefing payload (website contract)

```json
{
  "schemaVersion": 1,
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "generatedAt": "2026-07-26T11:00:12+05:30",
  "timezone": "Asia/Kolkata",
  "title": "India News Summary",
  "status": "ok",
  "meta": {
    "sourcesConfigured": 5,
    "sourcesSucceeded": 4,
    "articleCount": 28,
    "failedSources": [
      { "id": "ht_india", "name": "Hindustan Times", "error": "timeout" }
    ]
  },
  "categories": [
    {
      "category": "Politics",
      "bullets": [
        {
          "summary": "Short factual bullet",
          "sources": [
            { "title": "Article title", "url": "https://..." }
          ]
        }
      ]
    }
  ]
}
```

Omit categories with no items. Keep bullets scannable.

### 4.7 Website Publisher Component (n8n → API)

**Responsibility:** Push the latest briefing JSON to the website backend so the frontend can display it.

| Property | Value |
|----------|--------|
| Channel | Website HTTP API |
| n8n node | **HTTP Request** (PUT or POST) |
| Target | Config `website.publishUrl` (e.g. `/api/summary`) |
| Auth | Shared secret / API key header (e.g. `Authorization: Bearer …`) |
| Body | Canonical briefing JSON |

**Publish rules:**

- Publish only after a valid briefing JSON is assembled (`status: "ok"` with at least one category), unless an explicit degraded mode is enabled.
- On API failure: retry with backoff; mark workflow execution failed; **leave previous latest summary intact** on the server.
- Do not upload raw scraped HTML or full article dumps.
- Use idempotent replace semantics: each successful publish becomes the new “latest”.

### 4.8 Website Application (Frontend + API)

**Responsibility:** Store the latest briefing and present it to people in a browser.

#### Backend / API (minimal)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/summary` | `PUT` or `POST` | n8n publishes latest briefing (auth required) |
| `/api/summary` | `GET` | Frontend (or public clients) read latest briefing |

Storage options for v1 (pick one):

- Single JSON document in a DB / KV store / object storage
- Local/server file (`data/latest-summary.json`) for the simplest prototype
- Managed backend (e.g. Supabase / Firebase / simple Node/Express API)

**Write semantics:** Atomic replace of the latest document. Optional: keep a short history ring buffer later; not required for v1.

#### Frontend UI

Visitors should see:

- Page title / brand for the India news briefing
- **Last updated** time (`generatedAt`, formatted in `Asia/Kolkata`)
- Category sections with summary bullets and source links
- Light status (e.g. partial source failures) without cluttering the main content
- Responsive layout for desktop and mobile

Suggested UX flow:

```text
User opens website
        │
        ▼
Frontend fetches GET /api/summary
        │
        ▼
Render categories + bullets + sources + last updated
```

Optional: client refresh every N minutes, or show “Updated hourly” copy so users know freshness expectations.

### 4.9 Observability & Error Handling

| Concern | Approach |
|---------|----------|
| Per-source failures | Catch errors in the collection loop; continue; include in `meta.failedSources` |
| Empty corpus | Do not wipe the website; keep last good summary; log/run failure |
| LLM failures | Retry once; if still failing, keep last good website summary |
| Publish failures | Retry; do not claim success if API write failed |
| Dedup edge cases | Prefer over-dropping duplicates to double-counting the same story |
| Logging | Persist `runId`, source statuses, article counts, category counts in n8n execution data |
| Rate limits | Space HTTP requests; respect robots/ToS; prefer RSS |
| Overlapping hours | Disable concurrent workflow executions |

---

## 5. End-to-End Data Flow

```text
[1] Schedule Trigger @ every hour (0 * * * *)
        │
[2] Load config (sources, caps, website publish URL, categories)
        │
[3] For each enabled source (isolated try/catch)
        ├─ Fetch RSS or HTML
        ├─ Extract article candidates
        └─ Emit Article[] + SourceStatus
        │
[4] Merge Article[] → Normalize → Deduplicate → Cap
        │
[5] Guard: if empty → STOP (keep previous website summary)
        │
[6] AI Categorize each article
        │
[7] Group by category (drop empty / Other as configured)
        │
[8] AI Summarize each category group
        │
[9] Assemble briefing JSON (+ optional Markdown log)
        │
[10] HTTP PUT/POST → Website API /api/summary
        │
[11] Website stores latest JSON; frontend serves it to visitors
        │
[12] Mark execution success (with partial-failure flags if any)
```

---

## 6. n8n Workflow Topology

### 6.1 Suggested node graph

```text
Schedule Trigger (Cron 0 * * * *, TZ Asia/Kolkata)
        │
        ├─────────────── Manual Trigger (dev only)
        │
        ▼
Set / Code — Run Context + Config
        │
        ▼
Split Out — Sources[]
        │
        ▼
HTTP Request / RSS Read  ──on error──▶ Set Source Failed
        │
        ▼
Code — Extract & Normalize Articles
        │
        ▼
Aggregate / Merge Articles
        │
        ▼
Code — Deduplicate & Cap
        │
        ▼
IF — Articles exist?
   │no──▶ Log / End (do not overwrite website)
   │yes
        ▼
AI / LLM — Categorize (batched)
        │
        ▼
Code — Group by Category
        │
        ▼
AI / LLM — Summarize by Category (loop or single structured call)
        │
        ▼
Code — Build Briefing JSON
        │
        ▼
HTTP Request — Publish to Website API
        │
        ▼
End
```

### 6.2 Credentials required

| Credential | Used by |
|------------|---------|
| LLM provider API key | AI Categorize / Summarize nodes |
| Website publish API key / token | HTTP Request publisher |
| (Optional) Proxy / headers | HTTP Request if a source requires custom headers |

**Not required:** Gmail / Google OAuth for email.

### 6.3 Environment / instance settings

- n8n timezone recommended: `Asia/Kolkata` (for consistent timestamps).
- Workflow must be **Active** for the Schedule Trigger to fire hourly.
- Execution timeout sized for multi-source fetch + 2 AI stages (must typically finish in under one hour).
- Disable concurrent executions for this workflow.

---

## 7. Scheduler Deep Dive

### 7.1 Why a dedicated Scheduler component

The product SLA is:

> Every hour, the agent refreshes the India news summary and the website shows the latest briefing.

Treating the scheduler as a first-class component ensures:

- Predictable freshness for website visitors.
- Clear separation between **production hourly runs** and **manual test runs**.
- Stable run metadata (`runId`, `generatedAt`) shown as “Last updated” on the site.

### 7.2 Cron specification

| Field | Value | Meaning |
|-------|-------|---------|
| Minute | `0` | At minute 0 |
| Hour | `*` | Every hour |
| Day of month | `*` | Every day |
| Month | `*` | Every month |
| Day of week | `*` | Every day of week |

Expression: `0 * * * *`  
Timezone: `Asia/Kolkata` (recommended for display consistency)

### 7.3 Scheduler failure modes

| Failure | Mitigation |
|---------|------------|
| Workflow inactive | Deployment checklist: activate after import |
| Overlapping long run | Disable concurrent executions |
| Missed hour (downtime) | Next successful hour republishes latest; no need to backfill every missed hour for v1 |
| Publish API down | Keep last good summary on website; surface n8n error |

### 7.4 Manual / on-demand path

Developers and operators can trigger the same pipeline without waiting for cron:

- Manual Trigger → same Config → same pipeline → same website publish.

---

## 8. Security, Compliance, and Ethics

1. **Copyright** — Summarize; do not display full article bodies on the website.
2. **Terms of use** — Prefer official RSS/public feeds; keep scrapers minimal and respectful.
3. **Secrets** — Store LLM keys and website publish tokens only in n8n Credentials / env vars; never commit secrets.
4. **Website write auth** — Protect `PUT/POST /api/summary` with an API key; do not leave publish endpoints open.
5. **Public read** — `GET /api/summary` may be public if the product is a public briefing site; otherwise add read auth.
6. **Bias** — Prompts require neutral, factual language; no sensational framing.
7. **Hallucination control** — Model input is limited to extracted articles for the current run.

---

## 9. Scalability and Evolution

### 9.1 v1 (this architecture)

- 4–5 sources
- Hourly scheduled refresh
- Two-stage AI categorize + summarize
- Publish latest JSON to website API
- Frontend displays latest summary
- Partial source failure tolerance; keep last good summary on total failure

### 9.2 Likely extensions

| Extension | Change |
|-----------|--------|
| Summary history | Store last N hourly snapshots; UI “earlier today” |
| Slack / Telegram | Optional notify when publish succeeds |
| Better parsing | Per-source parser modules maintained via Cursor |
| Importance ranking | Use AI `importance` to limit bullets per category |
| Category filters | UI tabs / filters by category |
| Monitoring | Alert when N consecutive hourly runs fail |
| Caching / CDN | Cache `GET /api/summary` briefly for traffic spikes |

---

## 10. Success Criteria Mapping

| Success criterion (problem statement) | Architectural coverage |
|---------------------------------------|------------------------|
| Fetch from multiple Indian sites | Collection pipeline + Config sources |
| Extract relevant articles | Extract/normalize schema |
| Categorize meaningfully | AI Stage A + category enum |
| Clear concise summaries | AI Stage B + Formatter |
| Source links for traceability | Summary bullet `sources[]` |
| Run automatically every hour | **Scheduler `0 * * * *`** |
| Publish for website display | **Website Publisher + `/api/summary`** |
| People can read the briefing | **Frontend UI** |

---

## 11. Implementation Checklist

1. Create n8n workflow with Schedule Trigger (`0 * * * *`, `Asia/Kolkata`) and Manual Trigger.
2. Add Config node with sources, caps, categories, and website publish URL.
3. Implement per-source fetch + extract with isolated error handling.
4. Implement normalize/dedupe/cap Code node (empty run must not wipe the site).
5. Wire LLM categorization and summarization with grounded prompts.
6. Build canonical briefing JSON.
7. Build website API (`PUT/POST` + `GET /api/summary`) with publish auth.
8. Build frontend that renders categories, sources, and last updated.
9. Connect n8n HTTP Publisher to the API; verify manual publish.
10. Activate workflow; confirm hourly updates appear on the website.
11. Document API contract, credentials, and timezone in the project README (when added).

---

## 12. Summary

The system is an **n8n-orchestrated pipeline** with a dedicated **hourly Scheduler** that collects news from configured Indian sources, deduplicates and AI-processes articles into category summaries, and **publishes the latest briefing JSON to a website API**. A **frontend website** reads that payload so people can open a page and see an up-to-date India news summary. Email/Gmail is not part of this architecture; publish safety prefers keeping the last good summary when a run fails.
