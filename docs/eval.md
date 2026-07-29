# Evaluation Plan: AI News Summarizer Agent for India

Phase-by-phase evaluation for the build described in [`implementation-plan.md`](./implementation-plan.md), aligned with [`architecture.md`](./architecture.md), [`problemStatement.md`](./problemStatement.md), and [`edge-case.md`](./edge-case.md).

**How to use:** At the end of each phase, run the checks for that phase. A phase is **Pass** only if all **Must-pass** items succeed. **Should-pass** items can be deferred only with an explicit note; they must be cleared before Phase 8 Go-Live unless marked Optional.

---

## Scoring Rubric

| Result | Meaning |
|--------|---------|
| **Pass** | All Must-pass checks succeed |
| **Pass with issues** | Must-pass OK; ≤ 2 Should-pass failing with tracked follow-ups |
| **Fail** | Any Must-pass fails — do not start the next dependent phase |

### Quality scores (Phases 4, 6, 8)

When human judgment is needed, score 1–5:

| Score | Meaning |
|-------|---------|
| 5 | Excellent / production-ready |
| 4 | Good; minor nits |
| 3 | Acceptable for v1 |
| 2 | Needs rework |
| 1 | Unacceptable |

**Gate:** Average ≥ 3.0 on required quality dimensions before Go-Live.

---

## Phase 0 — Foundations

**Goal:** Environment ready; contracts agreed.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E0.1 | n8n reachable | Create + run trivial workflow | Execution succeeds |
| E0.2 | LLM credential works | Minimal AI/LLM node | Non-empty model response |
| E0.3 | Timezone decided | Document / instance setting | `Asia/Kolkata` (or documented equivalent) |
| E0.4 | Website stack chosen | Written decision | Storage + API approach named |
| E0.5 | JSON contract frozen | Compare to architecture §4.6 | `schemaVersion`, `categories`, `meta` agreed |
| E0.6 | Publish auth strategy | Env/secret approach | API key plan exists; not committed in git |
| E0.7 | Sources selected | Config draft | 4–5 sources listed with RSS/HTML notes |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E0.8 | RSS options found for ≥ 2 sources | Documented |
| E0.9 | Repo paths decided (`workflows/`, `web/`) | Documented |

### Phase 0 sign-off

- [ ] Pass
- Owner: ________  Date: ________

---

## Phase 1 — Skeleton & Scheduler

**Goal:** Dual triggers + config + run metadata.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E1.1 | Manual Trigger runs | Execute workflow | Emits run context |
| E1.2 | Run metadata present | Inspect output | `runId`, `runDate`, `triggeredAt`, `mode` set |
| E1.3 | Config loaded | Inspect output | Sources, caps, categories, `website.publishUrl` present |
| E1.4 | Cron expression | Open Schedule Trigger | `0 * * * *` |
| E1.5 | Workflow inactive | UI check | Not activating production yet |
| E1.6 | Concurrency setting | Workflow settings | Concurrent executions disabled |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E1.7 | Timezone on schedule | `Asia/Kolkata` set on trigger/instance |
| E1.8 | Manual `mode=manual` vs scheduled distinction | Correct `mode` value |

### Edge cases to probe

- C1 (all sources disabled) — config still loads
- C4 (missing publish URL) — detectable in config review

### Phase 1 sign-off

- [ ] Pass
- Owner: ________  Date: ________

---

## Phase 2 — News Collection

**Goal:** Multi-source `Article[]` + source statuses.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E2.1 | Multi-source fetch | Manual run | Articles from ≥ 2 sources |
| E2.2 | Schema completeness | Sample 10 articles | Each has `id`, `sourceId`, `sourceName`, `title`, `url` |
| E2.3 | Usable text | Sample 10 | Each has `snippet` or `content` non-empty (target ≥ 80%) |
| E2.4 | Source isolation | Disable/break one URL | Other sources still return articles |
| E2.5 | Per-source cap | Set low cap (e.g. 3) | No source exceeds cap |
| E2.6 | Source status recorded | Inspect output | Success/fail + counts present |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E2.7 | Relative URLs resolved | Absolute `https://` links |
| E2.8 | No obvious ad-only titles in sample | ≤ 10% clear ads in sample of 20 |
| E2.9 | `publishedAt` when available | Parsed ISO-like string for RSS items |

### Quantitative targets

| Metric | Target |
|--------|--------|
| Sources succeeding in a healthy run | ≥ 3 / configured |
| Articles with title+url | 100% of emitted items |
| Articles with snippet/content | ≥ 80% |

### Edge cases to probe

- N1, N3, N7, N12, N13, E1, E2 from [`edge-case.md`](./edge-case.md)

### Phase 2 sign-off

- [ ] Pass / Pass with issues
- Metrics: sources OK ___ / ___ ; articles ___
- Owner: ________  Date: ________

---

## Phase 3 — Normalize & Deduplicate

**Goal:** Clean corpus; empty guard does not wipe site policy readiness.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E3.1 | Exact URL dedupe | Fixture with duplicate URLs | One remaining |
| E3.2 | Tracking param strip | URL with `utm_*` | Canonical URL without utm |
| E3.3 | Near-duplicate titles | Fixture pair | Collapsed to one (or logged decision) |
| E3.4 | Total cap | Set `maxArticlesTotal` low | Output length ≤ cap |
| E3.5 | Empty guard | Force zero articles | No LLM call; no publish path taken |
| E3.6 | Stats emitted | Inspect | `articleCount` / dedupe stats available |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E3.7 | Prefer richer item on dedupe | Longer snippet kept |
| E3.8 | Prefer newer when dates exist | Newer `publishedAt` kept under cap |

### Quantitative targets

| Metric | Target |
|--------|--------|
| Exact duplicate URLs remaining | 0 |
| Obvious near-duplicate pairs remaining (manual sample) | ≤ 1 per 20 articles |

### Edge cases to probe

- D1–D5, E8, E10

### Phase 3 sign-off

- [ ] Pass / Pass with issues
- Owner: ________  Date: ________

---

## Phase 4 — AI Processing

**Goal:** Grounded categorization + category summaries with sources.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E4.1 | Category enum respected | Sample 20 articles | Labels ∈ configured list (or dropped/`Other`) |
| E4.2 | No empty-category spam | Output | Empty categories omitted |
| E4.3 | Sources on bullets | Sample 10 bullets | Each has ≥ 1 real input URL |
| E4.4 | No invented URLs | Compare to input set | 100% of links ⊆ input articles |
| E4.5 | Malformed LLM JSON recovery | Inject/simulate bad JSON once | Retry or safe fail; no crash loop |
| E4.6 | Grounding spot-check | 10 bullets vs source text | ≥ 8/10 facts supported (score ≥ 3) |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E4.7 | Duplicate story bullets rare | ≤ 1 clear dupe across a full briefing |
| E4.8 | Neutral tone | Spot-check 10 bullets; average tone ≥ 3 |
| E4.9 | Conciseness | Most bullets ≤ ~40 words |
| E4.10 | Low-confidence handling | Low-confidence items not force-mislabeled |

### Quality scorecard (human, 1–5)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Categorization accuracy | /5 | |
| Summary faithfulness (no hallucination) | /5 | |
| Clarity / conciseness | /5 | |
| Source traceability | /5 | |
| Neutrality | /5 | |
| **Average** | **/5** | Gate ≥ 3.0 |

### Edge cases to probe

- A1, A6, A7, A10, U1, U5, U6, U8, X4

### Phase 4 sign-off

- [ ] Pass / Pass with issues
- Average quality: ___ / 5
- Owner: ________  Date: ________

---

## Phase 5 — Website API & Frontend

**Goal:** Store + display latest summary; safe writes.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E5.1 | Authorized PUT stores fixture | `curl` with API key + `briefing_valid.json` | 2xx; stored |
| E5.2 | GET returns latest | `GET /api/summary` | Matches last PUT |
| E5.3 | Unauthorized PUT rejected | No/wrong key | 401/403; storage unchanged |
| E5.4 | Invalid schema rejected | `briefing_missing_sources.json` or empty categories | 4xx; previous latest intact |
| E5.5 | Empty state | GET before any publish | 404/empty handled |
| E5.6 | Frontend renders fixture | Open UI | Categories, bullets, sources, last updated visible |
| E5.7 | XSS safety | Fixture with `<script>` in summary | Rendered as text, not executed |
| E5.8 | Mobile layout | Narrow viewport | Readable; no major overflow |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E5.9 | Loading / error UI | Kill API briefly → error state + recovery |
| E5.10 | `javascript:` link not clickable as nav | Safe handling |
| E5.11 | Partial `meta.failedSources` optional display | Does not dominate page |

### Edge cases to probe

- W1–W3, W6, UI1, UI2, UI6, UI7, X1, X2

### Phase 5 sign-off

- [ ] Pass / Pass with issues
- Owner: ________  Date: ________

---

## Phase 6 — Format & Publish

**Goal:** n8n builds canonical JSON and updates the live site.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E6.1 | JSON schema compliance | Validate formatter output | Required fields present |
| E6.2 | Manual E2E publish | Manual Trigger → site refresh | UI shows new `generatedAt` / runId |
| E6.3 | Links work | Click 5 source links | Open correct articles |
| E6.4 | Failed publish preserves old | Stop API or wrong key once | Previous UI content remains |
| E6.5 | No full articles on site | Inspect payload + UI | Summaries only |
| E6.6 | Meta populated | Inspect JSON | Source success/fail counts present |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E6.7 | Markdown debug optional only | Website uses JSON, not Markdown |
| E6.8 | Publish retry once on 5xx | Observed in n8n logs/settings |

### Quality scorecard (human, 1–5)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Website readability | /5 | |
| Freshness clarity (last updated) | /5 | |
| End-to-end correctness | /5 | |
| **Average** | **/5** | Gate ≥ 3.0 |

### Edge cases to probe

- F1–F4, P1–P3, P7, Z2

### Phase 6 sign-off

- [ ] Pass / Pass with issues
- Owner: ________  Date: ________

---

## Phase 7 — Hardening

**Goal:** Resilience invariants hold under failure injection.

### Must-pass

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E7.1 | One source down | Break one source | Briefing still publishes from others |
| E7.2 | All sources down | Break all | No overwrite of last good |
| E7.3 | LLM failure | Invalid key / timeout simulate | No overwrite of last good |
| E7.4 | Publish failure | API down | No overwrite; execution failed visibly |
| E7.5 | Concurrency | Attempt overlap | No double-corrupt storage |
| E7.6 | Timeout budget | Settings review | Timeout &lt; 1 hour; concurrent off |

### Should-pass

| ID | Check | Pass if |
|----|-------|---------|
| E7.7 | Transient retry | 429/5xx once then success | Recovers without duplicate bad writes |
| E7.8 | Execution logs useful | `runId` + counts visible | Debuggable without screenshots only |

### Invariant checklist (from edge-case §15)

- [ ] No wipe on failure
- [ ] No concurrent corrupt writes
- [ ] No invented sources
- [ ] No full-article republication
- [ ] Source isolation
- [ ] Auth on write
- [ ] Safe render

### Phase 7 sign-off

- [ ] Pass / Pass with issues
- Owner: ________  Date: ________

---

## Phase 8 — Go-Live & Acceptance

**Goal:** Hourly production refresh meets problem-statement success criteria.

### Must-pass (pre-activation)

| ID | Check | Pass if |
|----|-------|---------|
| E8.1 | Cron is `0 * * * *` | Confirmed |
| E8.2 | Timezone correct | Confirmed |
| E8.3 | Prod publish URL + key | Confirmed |
| E8.4 | Manual prod/staging E2E today | Site updated |
| E8.5 | Phases 0–7 signed Pass (or issues closed) | Yes |

### Must-pass (post-activation)

| ID | Check | Method | Pass if |
|----|-------|--------|---------|
| E8.6 | Hourly fire | Wait for next hour (or temp near cron) | New `generatedAt` without manual run |
| E8.7 | Multi-source | Inspect `meta` | `sourcesSucceeded` ≥ 2 |
| E8.8 | Categorized briefing | Open website | Multiple category sections (typical day) |
| E8.9 | Source links | Spot-check 5 | Correct |
| E8.10 | Readable briefing | Human | Scannable in a few minutes; quality avg ≥ 3 |
| E8.11 | Workflow exported | Repo artifact | JSON saved |

### Problem-statement acceptance matrix

| Success criterion | Evidence | Pass? |
|-------------------|----------|-------|
| Fetch from multiple Indian sites | `meta.sourcesSucceeded` | [ ] |
| Extract relevant articles | Spot-check titles/URLs | [ ] |
| Categorize meaningfully | Spot-check categories | [ ] |
| Clear concise summaries | Quality scorecard | [ ] |
| Source links | Click test | [ ] |
| Run every hour | Two consecutive hourly `generatedAt` values | [ ] |
| Publish for website | PUT path + UI | [ ] |
| People can read briefing | Frontend live | [ ] |

### Final Go-Live quality scorecard

| Dimension | Score |
|-----------|-------|
| Overall usefulness | /5 |
| Faithfulness | /5 |
| Freshness reliability | /5 |
| UI clarity | /5 |
| **Average** | **/5** |

### Phase 8 sign-off

- [ ] **Production accepted**
- Owner: ________  Date: ________
- Notes: ________

---

## Phase 9 — Optional Extensions

Evaluate only for features you actually ship.

| Feature | Must-pass examples |
|---------|-------------------|
| History | Can open a prior hour without breaking latest |
| Category filters | Filter does not drop source links |
| Alerts | Alert fires on N consecutive failures; no alert spam on single flake |
| Importance ranking | Shorter digest still covers major stories (human ≥ 3) |

---

## Regression Pack (Run Before Each Release)

Minimum suite after any prompt/parser/API change:

1. Fixture: happy path publish → UI render  
2. Fixture: duplicates collapsed  
3. Empty corpus → last good preserved  
4. Unauthorized PUT rejected  
5. Invalid briefing rejected  
6. One source failure → still publishes  
7. XSS fixture safe in UI  
8. Spot-check 5 bullets for grounding + real URLs  

Record results:

| Date | Git/workflow rev | Result | Notes |
|------|------------------|--------|-------|
| | | Pass/Fail | |

---

## Evaluation Cadence After Go-Live

| Cadence | What to check |
|---------|----------------|
| Daily (first week) | `generatedAt` advancing; open site once |
| Weekly | 10-bullet grounding spot-check; source success rates |
| On parser break | Phase 2 + regression pack |
| On prompt change | Phase 4 quality scorecard + regression pack |

---

## Traceability

| Doc | Role |
|-----|------|
| [`implementation-plan.md`](./implementation-plan.md) | What to build per phase |
| [`edge-case.md`](./edge-case.md) | What can go wrong |
| [`eval.md`](./eval.md) | How to prove each phase works |
| [`architecture.md`](./architecture.md) | System design + JSON contract |
| [`problemStatement.md`](./problemStatement.md) | Success criteria |
