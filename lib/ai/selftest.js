/**
 * Phase 4 unit checks (no network; mock LLM).
 * Run: node lib/ai/selftest.js
 */
const assert = require("assert");
const {
  extractJsonObject,
  applyCategorization,
  groupByCategory,
  sanitizeCategorySummary,
  mergeBriefingCategories,
  runAiPipeline,
  parseCategorizeResponse,
  createRateLimiter,
  estimateTokens,
} = require("./index");

// JSON parse with fences
const parsed = extractJsonObject(
  '```json\n{"assignments":[{"articleId":"a1","category":"Politics","confidence":0.9}]}\n```'
);
assert.strictEqual(parsed.assignments[0].articleId, "a1");

assert.throws(() => extractJsonObject("not json at all"), /no_json_object|json_parse/);

// Rate limiter: run budget
const limiter = createRateLimiter({
  requestsPerMinute: 15,
  tokensPerMinute: 250000,
  requestsPerDay: 500,
  maxRequestsPerRun: 2,
  minRequestGapMs: 0,
});
assert.ok(estimateTokens("abcd", 0) >= 1);
(async () => {
  await limiter.acquire(10);
  await limiter.acquire(10);
  let threw = false;
  try {
    await limiter.acquire(10);
  } catch (e) {
    threw = e.code === "rate_limit_run";
  }
  assert.ok(threw, "third acquire should hit run cap");
  const stats = limiter.getStats();
  assert.strictEqual(stats.requestsPerMinuteLimit, 15);
  assert.strictEqual(stats.tokensPerMinuteLimit, 250000);
  assert.strictEqual(stats.requestsPerDayLimit, 500);
  assert.strictEqual(stats.runCount, 2);
})().then(() => {
  // continue rest of tests below via nested async main
  return mainTests();
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

async function mainTests() {
const articles = [
  {
    id: "p1",
    sourceId: "ndtv_india",
    sourceName: "NDTV",
    title: "Cabinet reshuffle: Joshi takes education charge",
    url: "https://www.ndtv.com/education/joshi",
    snippet: "Pralhad Joshi assumes charge as Union Education Minister",
    content: "Pralhad Joshi assumes charge as Union Education Minister after resignation",
  },
  {
    id: "s1",
    sourceId: "toi_india",
    sourceName: "Times of India",
    title: "India wins cricket Test by 5 wickets in Mumbai",
    url: "https://timesofindia.indiatimes.com/sports/cricket-win",
    snippet: "India sealed a 5-wicket win",
    content: "India sealed a 5-wicket win against visitors",
  },
  {
    id: "low",
    sourceId: "ie_india",
    sourceName: "Indian Express",
    title: "Ambiguous local update",
    url: "https://indianexpress.com/article/ambiguous",
    snippet: "Local notes",
    content: "Local notes",
  },
];

const applied = applyCategorization(
  articles,
  {
    assignments: [
      { articleId: "p1", category: "Education", confidence: 0.9, importance: 0.8 },
      { articleId: "s1", category: "Sports", confidence: 0.95 },
      { articleId: "low", category: "Politics", confidence: 0.1 },
      { articleId: "ghost", category: "Politics", confidence: 0.9 },
      { articleId: "p1", category: "Politics", confidence: 0.99 }, // dup id ignored
    ],
  },
  { minConfidence: 0.35 }
);

assert.strictEqual(applied.stats.categorizedCount, 2);
assert.strictEqual(applied.stats.lowConfidence, 1);
assert.ok(applied.articles.every((a) => a.category));
assert.strictEqual(applied.articles.find((a) => a.id === "p1").category, "Education");

const groups = groupByCategory(applied.articles, [
  "Politics",
  "Sports",
  "Education",
]);
assert.strictEqual(groups.length, 2);
assert.ok(!groups.some((g) => g.category === "Politics")); // empty omitted

const sanitized = sanitizeCategorySummary(
  "Sports",
  {
    category: "Sports",
    bullets: [
      {
        summary: "India won a cricket Test in Mumbai.",
        sources: [
          {
            title: "India wins cricket Test by 5 wickets in Mumbai",
            url: "https://timesofindia.indiatimes.com/sports/cricket-win",
          },
          {
            title: "Fake",
            url: "https://evil.example/invented",
          },
        ],
      },
      {
        summary: "Invented-only bullet",
        sources: [{ title: "Nope", url: "https://fake.example/x" }],
      },
    ],
  },
  articles.filter((a) => a.id === "s1")
);

assert.strictEqual(sanitized.bullets.length, 1);
assert.strictEqual(sanitized.bullets[0].sources.length, 1);
assert.ok(
  sanitized.bullets[0].sources[0].url.includes("timesofindia"),
  "only grounded URL kept"
);

const merged = mergeBriefingCategories([
  sanitized,
  { category: "Empty", bullets: [] },
]);
assert.strictEqual(merged.length, 1);

assert.throws(() => parseCategorizeResponse("{}"), /missing_assignments/);

  const result = await runAiPipeline(articles.slice(0, 2), {
    mock: true,
    categories: [
      "Politics",
      "Sports",
      "Business",
      "Technology",
      "Entertainment",
      "Health",
      "Education",
      "Crime",
      "Weather",
      "World",
    ],
    minConfidence: 0.35,
  });
  assert.ok(result.categories.length >= 1, "mock produces categories");
  assert.ok(result.guard.proceed);
  assert.strictEqual(result.guard.skipPublish, false);
  for (const cat of result.categories) {
    for (const b of cat.bullets) {
      assert.ok(b.sources.length >= 1);
      for (const s of b.sources) {
        assert.ok(/^https?:\/\//.test(s.url));
      }
    }
  }
  console.log("ai selftest OK", {
    categorized: result.ai.categorizedCount,
    categories: result.categories.map((c) => c.category),
    bullets: result.categories.reduce((n, c) => n + c.bullets.length, 0),
    rateLimits: { rpm: 15, tpm: 250000, rpd: 500 },
  });
}
