/**
 * Map a source + fetched body → Article[] + SourceStatus.
 */

const { canonicalizeUrl, hashArticleId } = require("./ids");
const { parseFeed, parseHtmlListing } = require("./parseFeed");
const { truncate } = require("./text");

function toArticle(source, raw, fetchedAt) {
  const title = (raw.title || "").trim();
  const url = canonicalizeUrl(raw.url);
  if (!title || !url || !/^https?:\/\//i.test(url)) return null;

  // Some feeds (e.g. Indian Express) ship empty descriptions — fall back to title.
  const snippet = truncate(raw.snippet || title, 500);
  const content = truncate(raw.content || snippet, 2000);

  return {
    id: hashArticleId(source.id, url),
    sourceId: source.id,
    sourceName: source.name,
    title,
    url,
    publishedAt: raw.publishedAt || null,
    snippet,
    content,
    fetchedAt,
  };
}

/**
 * @param {object} source - config source row
 * @param {object} opts
 * @param {string} [opts.body] - response body (RSS XML or HTML)
 * @param {number|null} [opts.statusCode]
 * @param {string|null} [opts.error]
 * @param {number} [opts.maxArticlesPerSource]
 * @param {string} [opts.fetchedAt] - ISO timestamp
 */
function extractArticlesFromFetch(source, opts = {}) {
  const fetchedAt = opts.fetchedAt || new Date().toISOString();
  const max = Math.max(1, Number(opts.maxArticlesPerSource) || 8);
  const statusCode = opts.statusCode ?? null;
  const errorMsg = opts.error ? String(opts.error) : null;
  const body = opts.body == null ? "" : String(opts.body);

  const baseStatus = {
    sourceId: source.id,
    sourceName: source.name,
    fetchMode: source.rssUrl ? "rss" : "html",
    fetchUrl: source.rssUrl || source.url,
    statusCode,
  };

  if (errorMsg) {
    return {
      articles: [],
      sourceStatus: {
        ...baseStatus,
        status: "failed",
        error: errorMsg,
        articleCount: 0,
      },
    };
  }

  if (statusCode != null && (statusCode < 200 || statusCode >= 300)) {
    return {
      articles: [],
      sourceStatus: {
        ...baseStatus,
        status: "failed",
        error: `HTTP ${statusCode}`,
        articleCount: 0,
      },
    };
  }

  if (!body.trim()) {
    return {
      articles: [],
      sourceStatus: {
        ...baseStatus,
        status: "failed",
        error: "Empty response body",
        articleCount: 0,
      },
    };
  }

  let rawItems;
  try {
    if (source.rssUrl) {
      rawItems = parseFeed(body);
      if (rawItems.length === 0) {
        // Soft fallback: maybe HTML was returned for an RSS URL
        rawItems = parseHtmlListing(body, source.url || source.rssUrl);
        baseStatus.fetchMode = rawItems.length ? "html-fallback" : "rss";
      }
    } else {
      rawItems = parseHtmlListing(body, source.url);
    }
  } catch (err) {
    return {
      articles: [],
      sourceStatus: {
        ...baseStatus,
        status: "failed",
        error: `Parse error: ${err.message || String(err)}`,
        articleCount: 0,
      },
    };
  }

  const articles = [];
  const seenIds = new Set();
  for (const raw of rawItems) {
    const article = toArticle(source, raw, fetchedAt);
    if (!article) continue;
    if (seenIds.has(article.id)) continue;
    seenIds.add(article.id);
    articles.push(article);
    if (articles.length >= max) break;
  }

  if (articles.length === 0) {
    return {
      articles: [],
      sourceStatus: {
        ...baseStatus,
        status: "failed",
        error: "No articles extracted",
        articleCount: 0,
      },
    };
  }

  return {
    articles,
    sourceStatus: {
      ...baseStatus,
      status: "success",
      error: null,
      articleCount: articles.length,
    },
  };
}

module.exports = { extractArticlesFromFetch, toArticle };
