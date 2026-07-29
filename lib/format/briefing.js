/**
 * Phase 6 — Build canonical schemaVersion:1 briefing JSON from pipeline output.
 */

const { toAsiaKolkataIso } = require("../normalize/text");

const DEFAULT_TITLE = "India News Summary";

function mapFailedSources(input) {
  const collection = input.collection || {};
  const corpus = input.corpus || {};
  const raw =
    collection.failedSources ||
    corpus.failedSources ||
    (Array.isArray(input.sourceStatuses)
      ? input.sourceStatuses
          .filter((s) => s.status === "failed")
          .map((s) => ({
            sourceId: s.sourceId,
            sourceName: s.sourceName,
            error: s.error,
          }))
      : []);

  return raw.map((entry) => ({
    id: entry.id || entry.sourceId || "unknown",
    name: entry.name || entry.sourceName || "Unknown source",
    error: entry.error || "unknown",
  }));
}

function sanitizeCategories(categories) {
  return (categories || [])
    .map((cat) => ({
      category: cat.category,
      bullets: (cat.bullets || [])
        .map((bullet) => ({
          summary: String(bullet.summary || "").trim(),
          sources: (bullet.sources || [])
            .map((source) => ({
              title: String(source.title || "").trim(),
              url: String(source.url || "").trim(),
            }))
            .filter((source) => source.title && /^https?:\/\//i.test(source.url)),
        }))
        .filter((bullet) => bullet.summary && bullet.sources.length > 0),
    }))
    .filter((cat) => cat.bullets.length > 0);
}

function resolveGeneratedAt(input, now = new Date()) {
  const candidates = [input.triggeredAt, input.generatedAt, now];
  for (const value of candidates) {
    const formatted = toAsiaKolkataIso(value);
    if (formatted) return formatted;
  }
  return toAsiaKolkataIso(now);
}

function formatBriefing(input, options = {}) {
  const config = input.config || {};
  const collection = input.collection || {};
  const corpus = input.corpus || {};
  const categories = sanitizeCategories(input.categories);
  const sourcesConfigured =
    collection.sourcesConfigured ??
    (Array.isArray(config.sources) ? config.sources.length : 0);
  const sourcesSucceeded =
    collection.sourcesSucceeded ?? corpus.sourceSuccessCount ?? 0;
  const articleCount =
    corpus.articleCount ?? collection.articleCount ?? input.articleCount ?? 0;

  const briefing = {
    schemaVersion: 1,
    runId: input.runId,
    generatedAt: resolveGeneratedAt(input, options.now),
    timezone: input.timezone || config.timezone || "Asia/Kolkata",
    title: options.title || DEFAULT_TITLE,
    status: "ok",
    meta: {
      sourcesConfigured,
      sourcesSucceeded,
      articleCount,
      failedSources: mapFailedSources(input),
    },
    categories,
  };

  const proceed =
    briefing.status === "ok" &&
    briefing.categories.length > 0 &&
    Boolean(briefing.runId);

  return {
    briefing,
    guard: {
      proceed,
      reason: proceed ? null : "no_publishable_categories",
      skipPublish: !proceed,
    },
  };
}

module.exports = {
  DEFAULT_TITLE,
  formatBriefing,
  mapFailedSources,
  sanitizeCategories,
  resolveGeneratedAt,
};
