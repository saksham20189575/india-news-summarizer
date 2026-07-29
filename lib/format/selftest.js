/**
 * Phase 6 unit checks (no network).
 * Run: node lib/format/selftest.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { formatBriefing } = require("./index");

const fixturePath = path.join(
  __dirname,
  "../../fixtures/ai/briefing_intermediate.json"
);
const intermediate = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const result = formatBriefing(intermediate);
assert.strictEqual(result.briefing.schemaVersion, 1);
assert.strictEqual(result.briefing.status, "ok");
assert.strictEqual(result.briefing.title, "India News Summary");
assert.ok(result.briefing.generatedAt.endsWith("+05:30"));
assert.ok(result.guard.proceed);
assert.ok(result.briefing.categories.length >= 1);

for (const cat of result.briefing.categories) {
  for (const bullet of cat.bullets) {
    assert.ok(bullet.summary);
    assert.ok(bullet.sources.length >= 1);
    for (const source of bullet.sources) {
      assert.match(source.url, /^https?:\/\//);
    }
  }
}

const empty = formatBriefing({ ...intermediate, categories: [] });
assert.strictEqual(empty.guard.proceed, false);
assert.strictEqual(empty.briefing.categories.length, 0);

const withFailed = formatBriefing({
  ...intermediate,
  collection: {
    sourcesConfigured: 5,
    sourcesSucceeded: 4,
    articleCount: 5,
    failedSources: [
      { sourceId: "ht_india", sourceName: "Hindustan Times", error: "timeout" },
    ],
  },
});
assert.deepStrictEqual(withFailed.briefing.meta.failedSources, [
  { id: "ht_india", name: "Hindustan Times", error: "timeout" },
]);

console.log("lib/format selftest passed");
