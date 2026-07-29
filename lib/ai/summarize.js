/**
 * Stage B — summarize per category with grounded source links.
 */

const { extractJsonObject } = require("./parseJson");
const { buildSummarizePrompt } = require("./prompts");

function normalizeUrl(u) {
  try {
    const url = new URL(String(u || "").trim());
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (_) {
    return String(u || "").trim();
  }
}

function indexArticlesByUrl(articles) {
  const byUrl = new Map();
  for (const a of articles || []) {
    const key = normalizeUrl(a.url);
    if (key) byUrl.set(key, a);
    // also raw
    if (a.url) byUrl.set(String(a.url).trim(), a);
  }
  return byUrl;
}

function sanitizeBullet(bullet, byUrl, allowedTitles) {
  const summary = String((bullet && bullet.summary) || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!summary) return null;

  const rawSources = Array.isArray(bullet.sources) ? bullet.sources : [];
  const sources = [];
  const seen = new Set();

  for (const s of rawSources) {
    const url = normalizeUrl(s && s.url);
    if (!url) continue;
    const article = byUrl.get(url) || byUrl.get(String(s.url || "").trim());
    if (!article) continue; // drop invented URLs
    const key = normalizeUrl(article.url);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: article.title || String((s && s.title) || "").trim(),
      url: article.url,
    });
  }

  // If model used titles without matching URLs, try title match
  if (!sources.length && allowedTitles) {
    for (const s of rawSources) {
      const title = String((s && s.title) || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!title) continue;
      const article = allowedTitles.get(title);
      if (!article) continue;
      const key = normalizeUrl(article.url);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ title: article.title, url: article.url });
    }
  }

  if (!sources.length) return null;
  return { summary, sources };
}

/**
 * Validate summarize LLM output against the category's input articles.
 * Drops empty categories and bullets with invented URLs.
 */
function sanitizeCategorySummary(category, llmPayload, articles) {
  const byUrl = indexArticlesByUrl(articles);
  const byTitle = new Map();
  for (const a of articles || []) {
    byTitle.set(
      String(a.title || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
      a
    );
  }

  const cat =
    (llmPayload && llmPayload.category) || category || "Unknown";
  const rawBullets = Array.isArray(llmPayload && llmPayload.bullets)
    ? llmPayload.bullets
    : [];

  const bullets = [];
  let droppedNoSources = 0;
  let droppedEmpty = 0;

  for (const b of rawBullets) {
    const clean = sanitizeBullet(b, byUrl, byTitle);
    if (!clean) {
      if (!b || !String(b.summary || "").trim()) droppedEmpty += 1;
      else droppedNoSources += 1;
      continue;
    }
    bullets.push(clean);
  }

  return {
    category: cat,
    bullets,
    stats: {
      rawBulletCount: rawBullets.length,
      keptBulletCount: bullets.length,
      droppedNoSources,
      droppedEmpty,
    },
  };
}

function parseSummarizeResponse(text) {
  const obj = extractJsonObject(text);
  if (!obj || typeof obj !== "object") {
    const err = new Error("summarize_invalid_object");
    err.code = "summarize_invalid_object";
    throw err;
  }
  if (!Array.isArray(obj.bullets)) {
    const err = new Error("summarize_missing_bullets");
    err.code = "summarize_missing_bullets";
    throw err;
  }
  return obj;
}

/**
 * Merge non-empty category summaries into intermediate briefing object.
 */
function mergeBriefingCategories(categoryResults) {
  const categories = [];
  for (const r of categoryResults || []) {
    if (!r || !r.category) continue;
    if (!Array.isArray(r.bullets) || r.bullets.length === 0) continue;
    categories.push({
      category: r.category,
      bullets: r.bullets,
    });
  }
  return categories;
}

module.exports = {
  sanitizeBullet,
  sanitizeCategorySummary,
  parseSummarizeResponse,
  mergeBriefingCategories,
  buildSummarizePrompt,
  normalizeUrl,
};
