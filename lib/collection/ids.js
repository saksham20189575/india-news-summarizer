/**
 * Stable article id + light URL canonicalization for collection.
 * Full URL normalize (utm strip etc.) is Phase 3; Phase 2 only needs stable ids.
 */

const crypto = require("crypto");

function canonicalizeUrl(rawUrl) {
  if (!rawUrl) return "";
  let s = String(rawUrl).trim();
  if (!s) return "";

  // Resolve common CDATA / whitespace quirks
  s = s.replace(/\s+/g, "");

  try {
    const u = new URL(s);
    // Drop common tracking params early so ids stay stable across RSS variants
    const drop = [];
    for (const key of u.searchParams.keys()) {
      if (/^utm_/i.test(key) || key === "fbclid" || key === "gclid") {
        drop.push(key);
      }
    }
    drop.forEach((k) => u.searchParams.delete(k));

    // NDTV / newsstand fragments
    if (u.hash && /publisher=/i.test(u.hash)) {
      u.hash = "";
    }

    u.hostname = u.hostname.toLowerCase();
    // Prefer https when host is a known news site (leave scheme as-is otherwise)
    let out = u.toString();
    if (out.endsWith("/") && u.pathname === "/") {
      // keep root slash
    } else if (out.endsWith("/") && !u.search && !u.hash) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return s;
  }
}

function hashArticleId(sourceId, canonicalUrl) {
  const payload = `${sourceId}|${canonicalUrl}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

module.exports = { canonicalizeUrl, hashArticleId };
