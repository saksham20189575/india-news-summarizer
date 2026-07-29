#!/usr/bin/env node
/**
 * Phase 3 local normalize/dedupe/cap over a collection fixture (or live collect).
 *
 * Usage:
 *   node scripts/normalize-articles.js
 *   node scripts/normalize-articles.js --in fixtures/collection/articles_duplicates.json
 *   node scripts/normalize-articles.js --live --out fixtures/collection/normalized.json
 *   node scripts/normalize-articles.js --empty   # prove empty guard
 */
const fs = require("fs");
const path = require("path");
const { buildCorpus } = require("../lib/normalize");
const { collectFromSources } = require("../lib/collection");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config/sources.json"), "utf8")
);

const args = process.argv.slice(2);
const inIdx = args.indexOf("--in");
const outIdx = args.indexOf("--out");
const inPath =
  inIdx >= 0
    ? args[inIdx + 1]
    : "fixtures/collection/articles_duplicates.json";
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const live = args.includes("--live");
const empty = args.includes("--empty");

async function loadInput() {
  if (empty) {
    return {
      articles: [],
      sourceStatuses: [],
      sources: config.sources,
      maxArticlesTotal: config.maxArticlesTotal,
    };
  }
  if (live) {
    const collected = await collectFromSources(config, { delayMs: 150 });
    return {
      articles: collected.articles,
      sourceStatuses: collected.sourceStatuses,
      sources: config.sources,
      maxArticlesTotal: config.maxArticlesTotal,
    };
  }
  const abs = path.isAbsolute(inPath) ? inPath : path.join(root, inPath);
  const data = JSON.parse(fs.readFileSync(abs, "utf8"));
  return {
    articles: data.articles || [],
    sourceStatuses: data.sourceStatuses || [],
    sources: data.sources || config.sources,
    maxArticlesTotal:
      data.maxArticlesTotal ?? config.maxArticlesTotal ?? 40,
  };
}

async function main() {
  const input = await loadInput();
  const corpus = buildCorpus(input.articles, {
    sources: input.sources,
    maxArticlesTotal: input.maxArticlesTotal,
    sourceStatuses: input.sourceStatuses,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    timezone: config.timezone,
    articles: corpus.articles,
    corpus: corpus.stats,
    guard: corpus.guard,
  };

  console.log(
    JSON.stringify(
      {
        corpus: corpus.stats,
        guard: corpus.guard,
        sample: corpus.articles.slice(0, 3).map((a) => ({
          sourceId: a.sourceId,
          title: a.title,
          url: a.url,
          publishedAt: a.publishedAt,
        })),
      },
      null,
      2
    )
  );

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(payload, null, 2) + "\n");
    console.error(
      `Wrote ${path.relative(root, abs)} (${corpus.stats.articleCount} articles)`
    );
  }

  if (empty) {
    if (corpus.guard.proceed || !corpus.guard.skipPublish) {
      console.error("FAIL: empty corpus should skip publish");
      process.exit(1);
    }
    console.error("OK: empty corpus guard engaged");
    return;
  }

  if (!live && inPath.includes("articles_duplicates")) {
    if (corpus.stats.exactDedupedCount < 1) {
      console.error("FAIL: expected exact dedupe");
      process.exit(1);
    }
    if (corpus.stats.nearDedupedCount < 1) {
      console.error("FAIL: expected near dedupe");
      process.exit(1);
    }
    if (corpus.stats.articleCount > input.maxArticlesTotal) {
      console.error("FAIL: cap not respected");
      process.exit(1);
    }
    console.error("OK: duplicate fixture collapsed + capped");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
