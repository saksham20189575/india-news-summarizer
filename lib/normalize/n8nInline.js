/**
 * Self-contained Phase 3 normalize/dedupe helpers for n8n Code nodes.
 * Keep in sync with lib/normalize/*.js — embedded by generate-phase3-workflow.js.
 */

function decodeEntities(text) {
  if (!text) return "";
  return String(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function cleanText(value) {
  return decodeEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

const TRACKING_PARAM =
  /^(utm_|fbclid$|gclid$|mc_eid$|mc_cid$|_ga$|igshid$|spm$|scm$|ncid$|cmpid$|ocid$)/i;

function canonicalizeUrl(rawUrl) {
  if (!rawUrl) return "";
  let s = String(rawUrl).trim().replace(/\s+/g, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    const drop = [];
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAM.test(key)) drop.push(key);
    }
    drop.forEach((k) => u.searchParams.delete(k));
    if (u.hash && (/publisher=/i.test(u.hash) || /^#?utm_/i.test(u.hash))) {
      u.hash = "";
    }
    u.hostname = u.hostname.toLowerCase();
    if (
      u.protocol === "http:" &&
      u.hostname !== "localhost" &&
      u.hostname !== "127.0.0.1"
    ) {
      u.protocol = "https:";
    }
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/" && !u.search && !u.hash) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return s;
  }
}

function toAsiaKolkataIso(input) {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "at",
  "by", "from", "as", "is", "are", "was", "were", "be", "been", "after",
  "before", "over", "under", "into", "about", "against", "between", "through",
  "during", "without", "within", "via", "vs", "vs.", "says", "said", "amid",
  "its", "his", "her", "their", "new", "latest", "live", "update", "updates",
  "breaking",
]);

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title) {
  return normalizeTitle(title)
    .split(" ")
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function jaccard(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function titlesNearDuplicate(titleA, titleB, threshold) {
  const thr = threshold == null ? 0.72 : threshold;
  const a = titleTokens(titleA);
  const b = titleTokens(titleB);
  const score = jaccard(a, b);
  if (score >= thr) return { match: true, score };
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4) {
    const longerSet = new Set(longer);
    const hit = shorter.filter((t) => longerSet.has(t)).length;
    const containment = hit / shorter.length;
    if (containment >= 0.9 && score >= 0.55) {
      return { match: true, score: Math.max(score, containment) };
    }
  }
  return { match: false, score };
}

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

function nearDedupe(articles, sourceRank, threshold) {
  const thr = threshold == null ? 0.72 : threshold;
  const kept = [];
  let dropped = 0;
  const ordered = [...articles].sort(
    (a, b) => richnessScore(b, sourceRank) - richnessScore(a, sourceRank)
  );
  for (const candidate of ordered) {
    let dupOf = null;
    for (const existing of kept) {
      const { match } = titlesNearDuplicate(candidate.title, existing.title, thr);
      if (match) {
        dupOf = existing;
        break;
      }
    }
    if (dupOf) {
      dropped += 1;
      if (richnessScore(candidate, sourceRank) > richnessScore(dupOf, sourceRank)) {
        kept[kept.indexOf(dupOf)] = candidate;
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

function buildCorpus(rawArticles, options) {
  options = options || {};
  const sourceRank = sourceRankMap(options.sources);
  const maxArticlesTotal = options.maxArticlesTotal == null ? 40 : options.maxArticlesTotal;
  const threshold =
    options.nearDuplicateThreshold == null ? 0.72 : options.nearDuplicateThreshold;
  const sourceStatuses = options.sourceStatuses || [];

  const normalized = [];
  for (const raw of rawArticles || []) {
    const a = normalizeArticle(raw);
    if (a) normalized.push(a);
  }

  const exact = exactDedupe(normalized, sourceRank);
  const near = nearDedupe(exact.articles, sourceRank, threshold);
  const capped = capArticles(near.articles, maxArticlesTotal);

  const sourceSuccessCount = sourceStatuses.filter((s) => s.status === "success").length;
  const sourceFailedCount = sourceStatuses.filter((s) => s.status === "failed").length;
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
