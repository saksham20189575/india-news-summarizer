/**
 * Lightweight HTML → plain text helpers for RSS descriptions / HTML fallbacks.
 * No external deps (safe to embed in n8n Code nodes).
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

module.exports = { decodeEntities, stripHtml, truncate };
