/**
 * Phase 3 unit checks (no network).
 * Run: node lib/normalize/selftest.js
 */
const assert = require("assert");
const {
  canonicalizeUrl,
  toAsiaKolkataIso,
  titlesNearDuplicate,
  buildCorpus,
} = require("./index");

assert.strictEqual(
  canonicalizeUrl("https://Example.com/story?utm_source=rss&utm_medium=feed&id=1"),
  "https://example.com/story?id=1"
);

const kol = toAsiaKolkataIso("2026-07-26T06:30:00.000Z");
assert.ok(kol.endsWith("+05:30"), kol);
assert.ok(kol.startsWith("2026-07-26T12:00:00"), kol);

const near = titlesNearDuplicate(
  "Pralhad Joshi takes charge as Union Education Minister after resignation",
  "Pralhad Joshi takes charge as Union Education Minister day after Pradhan resignation"
);
assert.ok(near.match, `expected near-dup, score=${near.score}`);

const far = titlesNearDuplicate(
  "Amarnath Yatra resumes after landslide blocks highway",
  "Scientists used AI to analyse birdsongs and identify motifs"
);
assert.ok(!far.match, `expected distinct, score=${far.score}`);

const sources = [
  { id: "india_today", name: "India Today" },
  { id: "ndtv_india", name: "NDTV" },
  { id: "ie_india", name: "Indian Express" },
];

const raw = [
  {
    id: "a1",
    sourceId: "india_today",
    sourceName: "India Today",
    title: "  Cabinet reshuffle: Joshi takes education charge  ",
    url: "https://www.indiatoday.in/story/joshi?utm_source=rss",
    publishedAt: "2026-07-26T10:00:00+05:30",
    snippet: "Short",
    content: "Short",
    fetchedAt: "2026-07-26T11:00:00.000Z",
  },
  {
    id: "a2",
    sourceId: "ndtv_india",
    sourceName: "NDTV",
    title: "Cabinet reshuffle: Joshi takes education charge",
    url: "https://www.indiatoday.in/story/joshi", // exact URL after canonicalize
    publishedAt: "2026-07-26T10:05:00+05:30",
    snippet: "Longer snippet with more detail about the swearing in ceremony today",
    content: "Longer snippet with more detail about the swearing in ceremony today",
    fetchedAt: "2026-07-26T11:00:00.000Z",
  },
  {
    id: "a3",
    sourceId: "ie_india",
    sourceName: "Indian Express",
    title: "Cabinet reshuffle Joshi takes education charge after Pradhan resignation",
    url: "https://indianexpress.com/article/joshi-education/",
    publishedAt: "2026-07-26T09:50:00+05:30",
    snippet: "IE coverage of the education portfolio change",
    content: "IE coverage of the education portfolio change",
    fetchedAt: "2026-07-26T11:00:00.000Z",
  },
  {
    id: "b1",
    sourceId: "ndtv_india",
    sourceName: "NDTV",
    title: "Amarnath Yatra resumes after landslide clears highway in Kashmir",
    url: "https://www.ndtv.com/india/amarnath-yatra-resumes",
    publishedAt: "2026-07-26T08:00:00+05:30",
    snippet: "Pilgrims move via Baltal",
    content: "Pilgrims move via Baltal",
    fetchedAt: "2026-07-26T11:00:00.000Z",
  },
  {
    id: "c1",
    sourceId: "india_today",
    sourceName: "India Today",
    title: "Old story from yesterday should be capped out when limit is tiny",
    url: "https://www.indiatoday.in/story/old",
    publishedAt: "2026-07-20T08:00:00+05:30",
    snippet: "Old",
    content: "Old",
    fetchedAt: "2026-07-26T11:00:00.000Z",
  },
];

const corpus = buildCorpus(raw, {
  sources,
  maxArticlesTotal: 2,
  sourceStatuses: [
    { sourceId: "india_today", status: "success" },
    { sourceId: "ndtv_india", status: "success" },
    { sourceId: "broken", status: "failed", error: "timeout" },
  ],
});

assert.ok(corpus.stats.exactDedupedCount >= 1, "exact URL dedupe");
assert.ok(corpus.stats.nearDedupedCount >= 1, "near title dedupe");
assert.strictEqual(corpus.stats.articleCount, 2, "cap respected");
assert.ok(corpus.guard.proceed);
assert.strictEqual(corpus.stats.sourceSuccessCount, 2);
assert.strictEqual(corpus.stats.sourceFailedCount, 1);

// Newest preferred under cap: Amarnath (08:00) vs cabinet (~10:00) — keep newest two
const urls = corpus.articles.map((a) => a.url);
assert.ok(
  urls.some((u) => u.includes("joshi") || u.includes("education")),
  "cabinet story kept"
);
assert.ok(urls.some((u) => u.includes("amarnath")), "amarnath kept");
assert.ok(!urls.some((u) => u.includes("/old")), "old story capped out");

const empty = buildCorpus([], { sources, maxArticlesTotal: 40, sourceStatuses: [] });
assert.strictEqual(empty.guard.proceed, false);
assert.strictEqual(empty.guard.skipPublish, true);
assert.strictEqual(empty.guard.reason, "empty_corpus");

console.log("normalize selftest OK", {
  exact: corpus.stats.exactDedupedCount,
  near: corpus.stats.nearDedupedCount,
  capped: corpus.stats.cappedCount,
  kept: corpus.stats.articleCount,
});
