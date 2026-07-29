/**
 * Minimal RSS 2.0 / Atom parser — no XML library required.
 */

const { stripHtml, truncate, decodeEntities } = require("./text");

function unwrapCdata(value) {
  if (!value) return "";
  const s = String(value).trim();
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return m ? m[1].trim() : s;
}

function tagContent(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const name of names) {
    const re = new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
      "i"
    );
    const m = block.match(re);
    if (m) return unwrapCdata(m[1]);
  }
  return "";
}

function selfClosingAttr(block, tagName, attrName) {
  const re = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["'][^>]*\\/?>`, "i");
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

function extractItems(xml) {
  const text = String(xml || "");
  const items = [];

  // RSS <item>
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(text)) !== null) {
    items.push({ kind: "rss", body: m[1] });
  }

  // Atom <entry>
  if (items.length === 0) {
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRe.exec(text)) !== null) {
      items.push({ kind: "atom", body: m[1] });
    }
  }

  return items;
}

function parseRssItem(item) {
  const { kind, body } = item;

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
    publishedAt =
      parsePublishedAt(tagContent(body, ["published", "updated"])) || null;
    snippet = stripHtml(
      tagContent(body, ["summary", "content"]) || ""
    );
    content = truncate(snippet, 2000);
  } else {
    link =
      tagContent(body, "link") ||
      selfClosingAttr(body, "link", "href") ||
      tagContent(body, "guid");
    // Prefer permalink guid when link looks empty
    if (!link) {
      link = tagContent(body, "guid");
    }
    publishedAt = parsePublishedAt(tagContent(body, "pubDate")) || null;
    const description = tagContent(body, "description");
    const encoded = tagContent(body, ["content:encoded", "content"]);
    snippet = stripHtml(description || encoded || "");
    content = truncate(stripHtml(encoded || description || ""), 2000);
  }

  title = decodeEntities(title).trim();
  link = unwrapCdata(link).trim();
  snippet = truncate(snippet, 500);

  return { title, url: link, publishedAt, snippet, content };
}

/**
 * Parse RSS/Atom XML into raw item objects (pre-canonicalization).
 */
function parseFeed(xml) {
  return extractItems(xml).map(parseRssItem);
}

/**
 * Very light HTML listing fallback when a source has no RSS.
 * Looks for article-like anchors; intentionally conservative.
 */
function parseHtmlListing(html, baseUrl) {
  const text = String(html || "");
  const results = [];
  const seen = new Set();
  const re =
    /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let href = m[1].trim();
    const title = stripHtml(m[2]);
    if (!title || title.length < 25) continue;
    if (/^(home|login|subscribe|advertisement)$/i.test(title)) continue;
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    results.push({
      title,
      url: href,
      publishedAt: null,
      snippet: "",
      content: "",
    });
    if (results.length >= 40) break;
  }
  return results;
}

module.exports = {
  parseFeed,
  parseHtmlListing,
  parsePublishedAt,
  unwrapCdata,
};
