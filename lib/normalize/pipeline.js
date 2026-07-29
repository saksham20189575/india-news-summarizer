/**
 * Phase 3 pipeline: normalize → exact dedupe → near-dedupe → cap.
 */

const { cleanText, canonicalizeUrl, toAsiaKolkataIso } = require("./text");
const { titlesNearDuplicate } = require("./similarity");

const DEFAULT_NEAR_THRESHOLD = 0.72;

function sourceRankMap(sources) {
  const map = new Map();
  (sources || []).forEach((s, i) => {
    if (s && s.id) map.set(s.id, i);
  });
  return map;
}

function richnessScore(article, sourceRank) {
  const snippetLen = (article.snippet || "").length;
  const contentLen = (article.content || "").length;
  const hasDate = article.publishedAt ? 1 : 0;
  const rank = sourceRank.has(article.sourceId)
    ? sourceRank.get(article.sourceId)
    : 999;
  // Higher is better; earlier source config order preferred (lower rank)
  return snippetLen + contentLen + hasDate * 200 - rank * 5;
}

function normalizeArticle(raw) {
  const title = cleanText(raw.title);
  const url = canonicalizeUrl(raw.url);
  const snippet = cleanText(raw.snippet);
  const content = cleanText(raw.content);
  const publishedAt = toAsiaKolkataIso(raw.publishedAt);
  const fetchedAt = toAsiaKolkataIso(raw.fetchedAt) || raw.fetchedAt || null;

  if (!title || !url) return null;

  return {
    id: raw.id,
    sourceId: raw.sourceId,
    sourceName: raw.sourceName,
    title,
    url,
    publishedAt,
    snippet,
    content: content || snippet,
    fetchedAt,
  };
}

function exactDedupe(articles, sourceRank) {
  const byKey = new Map();
  let dropped = 0;

  for (const a of articles) {
    const key = a.url || a.id;
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, a);
      continue;
    }
    dropped += 1;
    if (richnessScore(a, sourceRank) > richnessScore(existing, sourceRank)) {
      byKey.set(key, a);
    }
  }

  // Also collapse identical ids with different urls (rare)
  const byId = new Map();
  for (const a of byKey.values()) {
    const existing = byId.get(a.id);
    if (!existing) {
      byId.set(a.id, a);
      continue;
    }
    dropped += 1;
    if (richnessScore(a, sourceRank) > richnessScore(existing, sourceRank)) {
      byId.set(a.id, a);
    }
  }

  return { articles: [...byId.values()], dropped };
}

function nearDedupe(articles, sourceRank, threshold = DEFAULT_NEAR_THRESHOLD) {
  const kept = [];
  let dropped = 0;

  // Process richest-first so survivors tend to be better
  const ordered = [...articles].sort(
    (a, b) => richnessScore(b, sourceRank) - richnessScore(a, sourceRank)
  );

  for (const candidate of ordered) {
    let dupOf = null;
    for (const existing of kept) {
      const { match } = titlesNearDuplicate(
        candidate.title,
        existing.title,
        threshold
      );
      if (match) {
        dupOf = existing;
        break;
      }
    }
    if (dupOf) {
      dropped += 1;
      // Prefer richer; if candidate richer, replace
      if (
        richnessScore(candidate, sourceRank) > richnessScore(dupOf, sourceRank)
      ) {
        const idx = kept.indexOf(dupOf);
        kept[idx] = candidate;
      }
      continue;
    }
    kept.push(candidate);
  }

  return { articles: kept, dropped };
}

function capArticles(articles, maxTotal) {
  const max = Math.max(1, Number(maxTotal) || 40);
  const sorted = [...articles].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    return (b.fetchedAt || "").localeCompare(a.fetchedAt || "");
  });
  const capped = sorted.slice(0, max);
  return { articles: capped, dropped: Math.max(0, sorted.length - capped.length) };
}

/**
 * @param {object[]} rawArticles
 * @param {object} options
 * @param {object[]} [options.sources] - config.sources for preference order
 * @param {number} [options.maxArticlesTotal]
 * @param {number} [options.nearDuplicateThreshold]
 * @param {object[]} [options.sourceStatuses]
 */
function buildCorpus(rawArticles, options = {}) {
  const sourceRank = sourceRankMap(options.sources);
  const maxArticlesTotal = options.maxArticlesTotal ?? 40;
  const threshold = options.nearDuplicateThreshold ?? DEFAULT_NEAR_THRESHOLD;
  const sourceStatuses = options.sourceStatuses || [];

  const normalized = [];
  for (const raw of rawArticles || []) {
    const a = normalizeArticle(raw);
    if (a) normalized.push(a);
  }

  const exact = exactDedupe(normalized, sourceRank);
  const near = nearDedupe(exact.articles, sourceRank, threshold);
  const capped = capArticles(near.articles, maxArticlesTotal);

  const sourceSuccessCount = sourceStatuses.filter(
    (s) => s.status === "success"
  ).length;
  const sourceFailedCount = sourceStatuses.filter(
    (s) => s.status === "failed"
  ).length;
  const failedSources = sourceStatuses
    .filter((s) => s.status === "failed")
    .map((s) => ({
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      error: s.error,
    }));

  const articleCount = capped.articles.length;
  const dedupedCount = exact.dropped + near.dropped;

  return {
    articles: capped.articles,
    stats: {
      rawCount: (rawArticles || []).length,
      normalizedCount: normalized.length,
      exactDedupedCount: exact.dropped,
      nearDedupedCount: near.dropped,
      dedupedCount,
      cappedCount: capped.dropped,
      articleCount,
      sourceSuccessCount,
      sourceFailedCount,
      failedSources,
      nearDuplicateThreshold: threshold,
      maxArticlesTotal,
    },
    guard: {
      proceed: articleCount > 0,
      reason: articleCount > 0 ? null : "empty_corpus",
      skipLlm: articleCount === 0,
      skipPublish: articleCount === 0,
    },
  };
}

module.exports = {
  normalizeArticle,
  exactDedupe,
  nearDedupe,
  capArticles,
  buildCorpus,
  richnessScore,
  DEFAULT_NEAR_THRESHOLD,
};
