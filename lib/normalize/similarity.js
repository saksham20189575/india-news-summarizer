/**
 * Title similarity for near-duplicate detection.
 * Prefer over-dropping duplicates (architecture policy).
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "after",
  "before",
  "over",
  "under",
  "into",
  "about",
  "against",
  "between",
  "through",
  "during",
  "without",
  "within",
  "via",
  "vs",
  "vs.",
  "says",
  "said",
  "amid",
  "as",
  "its",
  "his",
  "her",
  "their",
  "new",
  "latest",
  "live",
  "update",
  "updates",
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

/**
 * @param {string} titleA
 * @param {string} titleB
 * @param {number} [threshold=0.72]
 */
function titlesNearDuplicate(titleA, titleB, threshold = 0.72) {
  const a = titleTokens(titleA);
  const b = titleTokens(titleB);
  const score = jaccard(a, b);
  if (score >= threshold) return { match: true, score };

  // Containment: shorter title mostly inside longer (syndication variants)
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

module.exports = {
  STOPWORDS,
  normalizeTitle,
  titleTokens,
  jaccard,
  titlesNearDuplicate,
};
