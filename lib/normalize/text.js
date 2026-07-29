/**
 * URL + text helpers for Phase 3 normalize.
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
    if (u.protocol === "http:") {
      // Prefer https for news article links when host is not localhost
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        u.protocol = "https:";
      }
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

/**
 * Format a Date / parseable string as ISO-8601 with Asia/Kolkata offset (+05:30).
 * Returns null if unparseable.
 */
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

module.exports = {
  decodeEntities,
  cleanText,
  canonicalizeUrl,
  toAsiaKolkataIso,
  TRACKING_PARAM,
};
