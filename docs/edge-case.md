# Edge Cases: AI News Summarizer Agent for India

Corner cases and required handling for the system described in [`architecture.md`](./architecture.md), [`problemStatement.md`](./problemStatement.md), and [`implementation-plan.md`](./implementation-plan.md).

**Global policy (v1):** Prefer **keeping the last good website summary** over publishing empty, invalid, or half-built data. Prefer **over-dropping duplicates** over showing the same story twice.

---

## 1. Severity Legend

| Severity | Meaning |
|----------|---------|
| **P0** | Can wipe/corrupt the public briefing or block all visitors |
| **P1** | Wrong or missing content for many users; must handle before Go-Live |
| **P2** | Degraded quality or ops friction; handle in hardening |
| **P3** | Rare / polish; track for later |

---

## 2. Scheduler & Execution

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| S1 | Workflow inactive — cron never fires | Deployment checklist; monitoring on stale `generatedAt` | P0 |
| S2 | Two runs overlap (run &gt; 1 hour) | Disable concurrent executions; skip/queue next fire | P0 |
| S3 | n8n down during the hour | Next successful hour republishes; no multi-hour backfill required for v1 | P1 |
| S4 | Manual + scheduled fire at same time | Same concurrency lock; only one publish wins | P1 |
| S5 | Clock / timezone drift vs `Asia/Kolkata` | Set instance TZ explicitly; show `generatedAt` with timezone | P1 |
| S6 | Cron misconfigured (`0 10 * * *` left from old design) | Verify `0 * * * *` in Go-Live checklist | P0 |
| S7 | Execution timeout mid-AI | Fail run; do not publish partial JSON; keep last good | P0 |
| S8 | Host reboot mid-publish | Atomic replace on API so storage is never half-written | P0 |

---

## 3. Configuration

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| C1 | All sources `enabled: false` | Treat as empty corpus; do not overwrite website | P1 |
| C2 | `maxArticlesPerSource` = 0 or negative | Clamp to safe default (≥ 1) or fail config validation | P1 |
| C3 | `maxArticlesTotal` &lt; per-source cap | Cap total after merge; document precedence | P2 |
| C4 | Missing `website.publishUrl` | Fail before publish; keep last good | P0 |
| C5 | Missing / wrong publish API key | 401 from API; n8n fails; keep last good | P0 |
| C6 | Duplicate `source.id` in config | Reject or dedupe config at load | P2 |
| C7 | Category enum changed but old prompts remain | Version prompts with config; reject unknown categories | P1 |
| C8 | Empty `recipientEmail` leftover from old docs | Ignore — email out of scope; remove from config | P3 |

---

## 4. News Collection

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| N1 | Single source HTTP 5xx / timeout | Mark source failed; continue others | P1 |
| N2 | Single source HTTP 403/401 (blocked) | Mark failed; prefer RSS; log; continue | P1 |
| N3 | All sources fail | Empty corpus → no publish overwrite | P0 |
| N4 | DNS failure / network unreachable | Same as N1/N3 | P1 |
| N5 | TLS / certificate error | Mark failed; do not disable TLS globally | P1 |
| N6 | RSS empty but HTML works (or vice versa) | Fall back per-source strategy if configured | P2 |
| N7 | HTML layout changed — selectors return 0 items | Mark source failed or “zero articles”; alert in meta | P1 |
| N8 | Page is mostly ads / nav / paywall wall | Strip junk; if no real content, drop item | P1 |
| N9 | Redirect to homepage / soft-404 | Detect non-article; drop or mark failed | P2 |
| N10 | Extremely large HTML response | Cap download size / truncate before parse | P1 |
| N11 | Non-UTF8 / garbled encoding | Decode best-effort; drop if unreadable | P2 |
| N12 | Relative URLs in links | Resolve against source base URL | P1 |
| N13 | `javascript:` or empty hrefs | Drop invalid URLs | P1 |
| N14 | Rate limited (429) | Backoff once; mark failed if still blocked | P1 |
| N15 | Source returns captcha / bot challenge | Mark failed; do not loop forever | P1 |
| N16 | Article list has only old stories | Still process within caps; freshness is best-effort | P2 |
| N17 | One source returns 100+ items | Enforce `maxArticlesPerSource` | P1 |
| N18 | Mixed language (Hindi + English) titles | Allow; summarize in English unless product says otherwise | P2 |
| N19 | Broken SSL intermediate / intermittent flakes | Retry transient once; then fail source | P2 |

---

## 5. Extraction & Article Schema

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| E1 | Missing title | Drop article | P1 |
| E2 | Missing URL | Drop article | P0 |
| E3 | Missing snippet and content | Drop or keep title-only only if categorization still useful; prefer drop | P1 |
| E4 | Missing `publishedAt` | Allow; sort by source order | P2 |
| E5 | Future / absurd dates | Clamp or ignore date for sorting | P2 |
| E6 | Title is “Sponsored” / “Advertisement” | Filter by keyword/heuristic | P1 |
| E7 | Duplicate title different URLs (syndication) | Near-dedupe in Phase 3 | P1 |
| E8 | URL with tracking params | Strip `utm_*` etc. before id/hash | P1 |
| E9 | URL fragments / mobile vs desktop hosts | Canonicalize where possible | P2 |
| E10 | HTML entities in title (`&amp;`) | Decode during normalize | P2 |
| E11 | Very long title/snippet | Truncate for LLM input; keep URL intact | P1 |
| E12 | Content includes scripts / inline CSS | Strip to text only | P1 |

---

## 6. Normalize & Deduplicate

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| D1 | Exact same URL from two sources | Keep one (richest) | P1 |
| D2 | Same story, slightly different titles | Fuzzy match; keep one | P1 |
| D3 | Fuzzy threshold too aggressive | Tune with fixtures; log dropped pairs | P1 |
| D4 | Fuzzy threshold too weak — duplicates remain | Spot-check eval; tighten | P1 |
| D5 | After dedupe, zero articles remain | Empty-run guard; no website overwrite | P0 |
| D6 | All articles from one source after others fail | Still publish if ≥ 1 valid category later | P1 |
| D7 | Cap removes newest stories accidentally | Prefer newest when dates exist | P1 |
| D8 | Identical id collision across sources | Include `sourceId` in hash (already required) | P1 |

---

## 7. AI Categorization

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| A1 | Model returns unknown category | Map to `Other` or drop; never invent new UI sections silently | P1 |
| A2 | Model returns multiple categories | Take highest-confidence single category | P2 |
| A3 | Low confidence for all labels | Drop or quarantine; do not force bad category | P1 |
| A4 | Politics vs Crime overlap | Prompt disambiguation rules; accept some ambiguity | P2 |
| A5 | World news about India abroad | Allow `World` or `Politics` per prompt guidance | P2 |
| A6 | Non-JSON / malformed LLM output | Retry once; then fail article or run per policy | P1 |
| A7 | LLM timeout / 429 | Retry once with backoff; on fail keep last good site | P0 |
| A8 | Empty article text but title present | Categorize on title only or drop | P2 |
| A9 | Batch partially fails | Process successful subset; document in meta | P1 |
| A10 | All articles categorized `Other` | If `Other` omitted from UI → empty publish guard | P1 |

---

## 8. AI Summarization

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| U1 | Hallucinated facts not in input | Prompt + eval spot-check; reject bullets without sources | P0 |
| U2 | Copies large verbatim article text | Prompt + length cap on bullets | P1 |
| U3 | Sensational / biased wording | Neutral-tone prompt; human spot-check in eval | P1 |
| U4 | Duplicate bullets for same story | Dedupe within category post-process | P1 |
| U5 | Missing source links | Require ≥ 1 source URL per bullet or drop bullet | P0 |
| U6 | Broken / invented URLs | Only allow URLs from input article set | P0 |
| U7 | Empty category after filtering | Omit category from JSON | P1 |
| U8 | All categories empty after summarize | Do not publish; keep last good | P0 |
| U9 | Mixed languages in summary | Prefer consistent English for v1 | P2 |
| U10 | Model adds “as an AI…” boilerplate | Strip / prompt forbid | P2 |
| U11 | Token limit exceeded for large category | Summarize in chunks then merge, or cap articles per category | P1 |
| U12 | Conflicting reports across sources | State neutrally or pick clearest; do not invent reconciliation | P1 |

---

## 9. Formatter / Briefing JSON

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| F1 | Missing `schemaVersion` | Reject publish | P0 |
| F2 | Missing `generatedAt` / `runId` | Reject or fill from run context before publish | P1 |
| F3 | `categories` empty array | Do not publish overwrite | P0 |
| F4 | Bullet without `sources` | Drop bullet or reject payload | P0 |
| F5 | Unexpected extra fields | Allow unknown fields only if API is tolerant; prefer strip | P3 |
| F6 | Huge payload | Cap bullets per category; reject oversize body | P1 |
| F7 | `status` not `ok` | Do not treat as successful publish | P1 |
| F8 | Markdown debug out of sync with JSON | JSON is source of truth for website | P2 |

---

## 10. Website Publish (n8n → API)

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| P1 | API 401/403 | Fail run; keep last good; alert ops | P0 |
| P2 | API 5xx / timeout | Retry with backoff; then fail; keep last good | P0 |
| P3 | API 400 validation error | Fail; keep last good; fix formatter | P0 |
| P4 | Network partition between n8n and API | Same as P2 | P0 |
| P5 | Publish succeeds but response body wrong | Treat 2xx + optional echo check; still OK if stored | P2 |
| P6 | Accidentally publishing fixture/test data to prod | Separate URLs/keys; `[manual]` logging | P1 |
| P7 | Partial JSON write to disk/DB | Atomic replace (write temp + rename, or DB transaction) | P0 |
| P8 | Stale n8n run publishes older than current latest | Optional: reject if `generatedAt` &lt; stored; else last-write-wins with concurrency off | P1 |

---

## 11. Website API & Storage

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| W1 | `GET` before any successful publish | 404 or empty payload + frontend empty state | P1 |
| W2 | Unauthenticated `PUT` | Reject 401 | P0 |
| W3 | Authenticated `PUT` with invalid schema | Reject; do not replace latest | P0 |
| W4 | Concurrent PUTs | Single-writer assumption + atomic replace | P1 |
| W5 | Disk full / DB write failure | 5xx to n8n; keep previous file/row if possible | P0 |
| W6 | Corrupt stored JSON | Detect on GET; serve error state; do not crash UI hard | P0 |
| W7 | Schema version bump incompatible | Version negotiation or migrate; reject unknown major | P1 |
| W8 | Very large stored document | Enforce max size on write | P2 |

---

## 12. Frontend UI

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| UI1 | `GET` fails (network) | Show error + retry; do not show blank crash | P1 |
| UI2 | `GET` returns empty / 404 | “No summary yet” state | P1 |
| UI3 | Missing category list | Empty state | P1 |
| UI4 | Bullet with no sources | Hide bullet or show without link | P1 |
| UI5 | Malformed date in `generatedAt` | Fallback “Updated: unknown” | P2 |
| UI6 | XSS in title/summary text | Escape/sanitize all rendered strings | P0 |
| UI7 | `javascript:` source URL | Do not render as clickable link | P0 |
| UI8 | Mobile narrow screens | Responsive layout; no horizontal overflow | P1 |
| UI9 | Slow API | Loading indicator | P2 |
| UI10 | Stale client cache | Cache-Control / no-store or short max-age; optional auto-refresh | P2 |
| UI11 | Partial source failures in `meta` | Optional subtle note; don’t dominate UI | P2 |
| UI12 | Many categories / long page | Scannable headings; optional jump links later | P3 |

---

## 13. Security & Compliance

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| X1 | Publish API key leaked in frontend bundle | Never ship write key to browser | P0 |
| X2 | Publish endpoint open to world | Require auth always | P0 |
| X3 | Full article HTML stored on site | Forbid; summaries + links only | P0 |
| X4 | Prompt injection via article text | Instruct model to treat content as data; don’t follow instructions in articles | P1 |
| X5 | Secrets in exported workflow JSON | Use n8n credentials / env; scrub before commit | P0 |
| X6 | Scraping ToS / robots issues | Prefer RSS; respectful rate limits | P1 |

---

## 14. End-to-End / Product

| ID | Edge case | Expected handling | Sev |
|----|-----------|-------------------|-----|
| Z1 | Hourly run produces identical content | Still update `generatedAt` or skip publish if hash unchanged (either OK; document choice) | P2 |
| Z2 | News drought (few articles) | Publish thin but valid briefing | P1 |
| Z3 | Breaking news mid-hour | Acceptable lag until next hour (v1) | P3 |
| Z4 | One category dominates entire page | Cap bullets per category | P2 |
| Z5 | User expects email digest | Out of scope — website only | P3 |

---

## 15. Required Invariants (Always True)

1. **No wipe on failure:** Empty corpus, LLM failure, or publish failure must not clear a previously good latest summary.
2. **No concurrent corrupt writes:** At most one publisher effective at a time; storage replace is atomic.
3. **No invented sources:** Every displayed link must come from collected article URLs.
4. **No full-article republication:** Website shows summaries + links only.
5. **Source isolation:** One bad source cannot abort siblings.
6. **Auth on write:** `PUT/POST /api/summary` always requires a secret.
7. **Safe render:** Frontend escapes user/model-provided text.

---

## 16. Suggested Fixture Set for Repro

Keep small fixtures under something like `fixtures/` (when implemented):

| Fixture | Purpose |
|---------|---------|
| `articles_happy.json` | Normal multi-source mix |
| `articles_duplicates.json` | Exact + near-duplicate titles |
| `articles_empty.json` | Zero articles after extract |
| `articles_ads_noise.json` | Nav/ads-only extraction |
| `briefing_valid.json` | Canonical good payload |
| `briefing_missing_sources.json` | Should be rejected by API |
| `briefing_empty_categories.json` | Should not overwrite latest |
| `html_layout_changed.html` | Parser returns zero items |

---

## 17. Related Docs

- Architecture: [`architecture.md`](./architecture.md)
- Implementation phases: [`implementation-plan.md`](./implementation-plan.md)
- Phase evaluations: [`eval.md`](./eval.md)
