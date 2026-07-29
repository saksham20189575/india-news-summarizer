/**
 * Stage A — categorize articles and attach labels.
 */

const { extractJsonObject } = require("./parseJson");
const {
  DEFAULT_CATEGORIES,
  buildCategorizePrompt,
  batchArticles,
} = require("./prompts");

function normalizeCategory(raw, allowed) {
  if (!raw) return null;
  const s = String(raw).trim();
  const hit = allowed.find((c) => c.toLowerCase() === s.toLowerCase());
  return hit || null;
}

function clamp01(n, fallback = null) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Validate LLM categorize JSON and map onto articles.
 * Drops unknown categories and low-confidence items.
 */
function applyCategorization(articles, llmPayload, options = {}) {
  const allowed = options.categories || DEFAULT_CATEGORIES;
  const minConfidence =
    typeof options.minConfidence === "number" ? options.minConfidence : 0.35;

  const byId = new Map((articles || []).map((a) => [a.id, a]));
  const assignments = Array.isArray(llmPayload && llmPayload.assignments)
    ? llmPayload.assignments
    : [];

  const categorized = [];
  const dropped = [];
  let unknownCategory = 0;
  let lowConfidence = 0;
  let unknownId = 0;

  const seen = new Set();

  for (const row of assignments) {
    const articleId = row && row.articleId;
    if (!articleId || !byId.has(articleId)) {
      unknownId += 1;
      continue;
    }
    if (seen.has(articleId)) continue;
    seen.add(articleId);

    const category = normalizeCategory(row.category, allowed);
    const confidence = clamp01(row.confidence, 0.5);
    const importance = clamp01(row.importance, null);

    if (!category) {
      unknownCategory += 1;
      dropped.push({
        articleId,
        reason: "unknown_category",
        rawCategory: row.category,
      });
      continue;
    }
    if (confidence < minConfidence) {
      lowConfidence += 1;
      dropped.push({
        articleId,
        reason: "low_confidence",
        category,
        confidence,
      });
      continue;
    }

    const base = byId.get(articleId);
    categorized.push({
      ...base,
      category,
      confidence,
      importance,
    });
  }

  // Articles the model skipped entirely
  for (const a of articles || []) {
    if (!seen.has(a.id)) {
      dropped.push({ articleId: a.id, reason: "missing_assignment" });
    }
  }

  return {
    articles: categorized,
    dropped,
    stats: {
      inputCount: (articles || []).length,
      categorizedCount: categorized.length,
      droppedCount: dropped.length,
      unknownCategory,
      lowConfidence,
      unknownId,
      minConfidence,
    },
  };
}

function parseCategorizeResponse(text) {
  const obj = extractJsonObject(text);
  if (!obj || !Array.isArray(obj.assignments)) {
    const err = new Error("categorize_missing_assignments");
    err.code = "categorize_missing_assignments";
    throw err;
  }
  return obj;
}

/**
 * Group categorized articles; omit empty categories.
 * Preserves configured category order.
 */
function groupByCategory(articles, categories) {
  const order = categories || DEFAULT_CATEGORIES;
  const map = new Map(order.map((c) => [c, []]));
  for (const a of articles || []) {
    if (!a.category || !map.has(a.category)) continue;
    map.get(a.category).push(a);
  }
  const groups = [];
  for (const category of order) {
    const items = map.get(category) || [];
    if (items.length) groups.push({ category, articles: items });
  }
  return groups;
}

module.exports = {
  normalizeCategory,
  applyCategorization,
  parseCategorizeResponse,
  groupByCategory,
  buildCategorizePrompt,
  batchArticles,
};
