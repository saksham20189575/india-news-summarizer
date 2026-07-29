#!/usr/bin/env node
/**
 * Phase 4 local AI categorize + summarize.
 *
 * Usage:
 *   node scripts/process-ai.js --mock
 *   node scripts/process-ai.js --mock --in fixtures/ai/articles_sample.json
 *   node scripts/process-ai.js --mock --live   # collect+normalize then mock AI
 *   GEMINI_API_KEY=... node scripts/process-ai.js --live
 *   node scripts/process-ai.js --mock --out fixtures/ai/briefing_intermediate.json
 */
const fs = require("fs");
const path = require("path");
const { runAiPipeline } = require("../lib/ai");
const { collectFromSources } = require("../lib/collection");
const { buildCorpus } = require("../lib/normalize");

const root = path.join(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config/sources.json"), "utf8")
);

const args = process.argv.slice(2);
const inIdx = args.indexOf("--in");
const outIdx = args.indexOf("--out");
const inPath =
  inIdx >= 0 ? args[inIdx + 1] : "fixtures/ai/articles_sample.json";
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
const live = args.includes("--live");
const mock = args.includes("--mock") || !process.env.GEMINI_API_KEY;

async function loadArticles() {
  if (live) {
    const collected = await collectFromSources(config, { delayMs: 150 });
    const corpus = buildCorpus(collected.articles, {
      sources: config.sources,
      maxArticlesTotal: config.maxArticlesTotal,
      sourceStatuses: collected.sourceStatuses,
    });
    return {
      articles: corpus.articles,
      corpus: corpus.stats,
      sourceStatuses: collected.sourceStatuses,
      collection: collected.collection || {
        sourcesSucceeded: collected.sourceStatuses.filter(
          (s) => s.status === "success"
        ).length,
      },
    };
  }
  const abs = path.isAbsolute(inPath) ? inPath : path.join(root, inPath);
  const data = JSON.parse(fs.readFileSync(abs, "utf8"));
  return {
    articles: data.articles || [],
    corpus: data.corpus || null,
    sourceStatuses: data.sourceStatuses || [],
    collection: data.collection || null,
  };
}

async function main() {
  const input = await loadArticles();
  if (!input.articles.length) {
    console.error("No articles to process");
    process.exit(1);
  }

  const llm = config.llm || {};
  const result = await runAiPipeline(input.articles, {
    mock,
    apiKey: process.env.GEMINI_API_KEY,
    categories: config.categories,
    model: llm.model,
    thinkingLevel: llm.thinkingLevel || "minimal",
    categorizeBatchSize: llm.categorizeBatchSize,
    maxContentChars: llm.maxContentChars,
    minConfidence: llm.minConfidence,
    maxRetries: llm.maxRetries,
    maxRequestsPerRun: llm.maxRequestsPerRun,
    minRequestGapMs: llm.minRequestGapMs,
    rateLimits: llm.rateLimits,
    timeout: llm.timeoutMs,
    fallbackMockOnError: mock,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    timezone: config.timezone,
    runId: "local-process-ai",
    articles: result.articles,
    categories: result.categories,
    ai: result.ai,
    guard: result.guard,
    corpus: input.corpus,
    sourceStatuses: input.sourceStatuses,
    phase: "phase4-ai",
  };

  console.log(
    JSON.stringify(
      {
        mock,
        ai: {
          categorizedCount: result.ai.categorizedCount,
          summarizedCategories: result.ai.summarizedCategories,
          errors: result.ai.errors,
        },
        guard: result.guard,
        categories: result.categories.map((c) => ({
          category: c.category,
          bullets: c.bullets.length,
        })),
        sample: (result.categories[0] && result.categories[0].bullets[0]) || null,
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
      `Wrote ${path.relative(root, abs)} (${result.categories.length} categories)`
    );
  }

  if (!result.guard.proceed) {
    console.error("FAIL: empty AI briefing");
    process.exit(1);
  }
  console.error(
    `OK: ${result.ai.categorizedCount} categorized → ${result.categories.length} categories (${mock ? "mock" : "gemini"})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
