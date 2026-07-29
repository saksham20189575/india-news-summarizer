#!/usr/bin/env node
/**
 * Local Phase 2 collector — fetch enabled sources and print Article[] + sourceStatuses.
 *
 * Usage:
 *   node scripts/collect-news.js
 *   node scripts/collect-news.js --out fixtures/collection/latest.json
 *   node scripts/collect-news.js --broken   # inject a bad URL to prove isolation
 */
const fs = require("fs");
const path = require("path");
const { collectFromSources } = require("../lib/collection");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config/sources.json"), "utf8")
);

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const withBroken = args.includes("--broken");

async function main() {
  const runtime = structuredClone(config);
  if (withBroken) {
    runtime.sources.push({
      id: "broken_source",
      name: "Broken Source",
      type: "rss",
      url: "https://example.invalid/india",
      rssUrl: "https://example.invalid/rss-does-not-exist.xml",
      enabled: true,
      notes: "Intentional failure for isolation test",
    });
  }

  const result = await collectFromSources(runtime, { delayMs: 200 });

  const payload = {
    generatedAt: new Date().toISOString(),
    timezone: runtime.timezone,
    articles: result.articles,
    sourceStatuses: result.sourceStatuses,
    stats: result.stats,
  };

  const summary = {
    stats: result.stats,
    sources: result.sourceStatuses.map((s) => ({
      id: s.sourceId,
      status: s.status,
      articleCount: s.articleCount,
      error: s.error,
    })),
    sample: result.articles.slice(0, 3).map((a) => ({
      id: a.id,
      sourceId: a.sourceId,
      title: a.title,
      url: a.url,
      hasSnippet: Boolean(a.snippet),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(payload, null, 2) + "\n");
    console.error(`Wrote ${path.relative(root, abs)} (${result.articles.length} articles)`);
  }

  const ok = result.stats.sourcesSucceeded >= 3;
  if (!ok) {
    console.error("FAIL: expected ≥ 3 successful sources");
    process.exit(1);
  }
  if (withBroken) {
    const broken = result.sourceStatuses.find((s) => s.sourceId === "broken_source");
    if (!broken || broken.status !== "failed") {
      console.error("FAIL: broken source should be status=failed");
      process.exit(1);
    }
    if (result.stats.sourcesSucceeded < 1) {
      console.error("FAIL: other sources should still succeed");
      process.exit(1);
    }
    console.error("OK: broken source isolated; others continued");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
