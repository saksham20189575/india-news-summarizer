/**
 * Self-contained collection helpers for n8n Code nodes.
 * Keep in sync with lib/collection/*.js — used by generate-phase2-workflow.js.
 * No require()/module.exports (n8n Code sandbox).
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

function stripHtml(html) {
  if (!html) return "";
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function truncate(text, maxLen) {
  const s = String(text || "").trim();
  if (!maxLen || s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + "…";
}

function canonicalizeUrl(rawUrl) {
  if (!rawUrl) return "";
  let s = String(rawUrl).trim().replace(/\s+/g, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    const drop = [];
    for (const key of u.searchParams.keys()) {
      if (/^utm_/i.test(key) || key === "fbclid" || key === "gclid") drop.push(key);
    }
    drop.forEach((k) => u.searchParams.delete(k));
    if (u.hash && /publisher=/i.test(u.hash)) u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/" && !u.search && !u.hash) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return s;
  }
}

function hashArticleId(sourceId, canonicalUrl) {
  const payload = `${sourceId}|${canonicalUrl}`;
  if (typeof crypto !== "undefined" && crypto.createHash) {
    return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
  }
  // Fallback FNV-1a 64-bit hex (rare — n8n Node has crypto)
  let h = 0xcbf29ce484222325n;
  const data = Buffer.from(payload);
  for (let i = 0; i < data.length; i++) {
    h ^= BigInt(data[i]);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

function unwrapCdata(value) {
  if (!value) return "";
  const s = String(value).trim();
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return m ? m[1].trim() : s;
}

function tagContent(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const m = block.match(re);
    if (m) return unwrapCdata(m[1]);
  }
  return "";
}

function selfClosingAttr(block, tagName, attrName) {
  const re = new RegExp(
    `<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["'][^>]*\\/?>`,
    "i"
  );
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function parsePublishedAt(raw) {
  if (!raw) return null;
  const cleaned = unwrapCdata(raw).trim();
  if (!cleaned) return null;
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseFeed(xml) {
  const text = String(xml || "");
  const chunks = [];
  let m;
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  while ((m = itemRe.exec(text)) !== null) chunks.push({ kind: "rss", body: m[1] });
  if (chunks.length === 0) {
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRe.exec(text)) !== null) chunks.push({ kind: "atom", body: m[1] });
  }

  return chunks.map(({ kind, body }) => {
    let title = stripHtml(tagContent(body, "title"));
    let link = "";
    let publishedAt = null;
    let snippet = "";
    let content = "";

    if (kind === "atom") {
      link =
        selfClosingAttr(body, "link", "href") ||
        tagContent(body, "link") ||
        tagContent(body, "id");
      publishedAt = parsePublishedAt(tagContent(body, ["published", "updated"]));
      snippet = stripHtml(tagContent(body, ["summary", "content"]) || "");
      content = truncate(snippet, 2000);
    } else {
      link =
        tagContent(body, "link") ||
        selfClosingAttr(body, "link", "href") ||
        tagContent(body, "guid");
      publishedAt = parsePublishedAt(tagContent(body, "pubDate"));
      const description = tagContent(body, "description");
      const encoded = tagContent(body, ["content:encoded", "content"]);
      snippet = stripHtml(description || encoded || "");
      content = truncate(stripHtml(encoded || description || ""), 2000);
    }

    return {
      title: decodeEntities(title).trim(),
      url: unwrapCdata(link).trim(),
      publishedAt,
      snippet: truncate(snippet, 500),
      content,
    };
  });
}

function parseHtmlListing(html, baseUrl) {
  const text = String(html || "");
  const results = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let href = m[1].trim();
    const title = stripHtml(m[2]);
    if (!title || title.length < 25) continue;
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    results.push({ title, url: href, publishedAt: null, snippet: "", content: "" });
    if (results.length >= 40) break;
  }
  return results;
}

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

function extractArticlesFromFetch(source, opts) {
  const fetchedAt = opts.fetchedAt || new Date().toISOString();
  const max = Math.max(1, Number(opts.maxArticlesPerSource) || 8);
  const statusCode = opts.statusCode == null ? null : opts.statusCode;
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
        error: `Parse error: ${err && err.message ? err.message : String(err)}`,
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
