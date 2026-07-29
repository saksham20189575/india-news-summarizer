/**
 * Fetch enabled sources with isolation and return Article[] + sourceStatuses[].
 */

const { extractArticlesFromFetch } = require("./extract");

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; IndiaNewsSummarizer/0.2; +https://localhost)";

async function fetchText(url, { timeoutMs = 20000, userAgent = DEFAULT_UA } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
      },
      signal: controller.signal,
    });
    const body = await res.text();
    return { statusCode: res.status, body, error: null };
  } catch (err) {
    const msg =
      err && err.name === "AbortError"
        ? `Timeout after ${timeoutMs}ms`
        : err.message || String(err);
    return { statusCode: null, body: "", error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} config - from config/sources.json (or runtime config)
 * @param {object} [options]
 */
async function collectFromSources(config, options = {}) {
  const sources = (config.sources || []).filter((s) => s.enabled);
  const maxArticlesPerSource = config.maxArticlesPerSource || 8;
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const delayMs = options.delayMs ?? 150;

  const articles = [];
  const sourceStatuses = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const fetchUrl = source.rssUrl || source.url;
    const fetched = await fetchText(fetchUrl, {
      timeoutMs: options.timeoutMs || 20000,
      userAgent: options.userAgent,
    });

    const { articles: batch, sourceStatus } = extractArticlesFromFetch(source, {
      body: fetched.body,
      statusCode: fetched.statusCode,
      error: fetched.error,
      maxArticlesPerSource,
      fetchedAt,
    });

    articles.push(...batch);
    sourceStatuses.push(sourceStatus);

    if (delayMs > 0 && i < sources.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    articles,
    sourceStatuses,
    stats: {
      sourcesConfigured: (config.sources || []).length,
      sourcesEnabled: sources.length,
      sourcesSucceeded: sourceStatuses.filter((s) => s.status === "success").length,
      sourcesFailed: sourceStatuses.filter((s) => s.status === "failed").length,
      articleCount: articles.length,
    },
  };
}

module.exports = { collectFromSources, fetchText };
