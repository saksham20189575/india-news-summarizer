/**
 * Prompt builders for Stage A (categorize) and Stage B (summarize).
 * Keep text aligned with prompts/*.md.
 */

const DEFAULT_CATEGORIES = [
  "Politics",
  "Sports",
  "Business",
  "Technology",
  "Entertainment",
  "Health",
  "Education",
  "Crime",
  "Weather",
  "World",
];

const CATEGORIZE_SYSTEM = `You are a news categorization assistant for Indian news briefings.

Assign each article exactly one category from this enum:
{{CATEGORIES}}

Rules:
1. Use only the provided title, snippet/content, and source name.
2. Do not invent facts.
3. Prefer the most specific matching category.
4. If the story is international with India angle, prefer World only when the primary focus is outside India; otherwise use the topical category.
5. Weather covers weather and environment.
6. Return confidence between 0 and 1, and optional importance between 0 and 1.

Return ONLY valid JSON (no markdown fences) in this shape:
{
  "assignments": [
    {
      "articleId": "string",
      "category": "Politics",
      "confidence": 0.86,
      "importance": 0.7
    }
  ]
}

Include one assignment per input articleId. Do not invent articleIds.`;

const SUMMARIZE_SYSTEM = `You are an AI news summarization assistant for an India hourly briefing.

Category to summarize: {{CATEGORY}}

Rules:
1. Use only the article information provided below.
2. Do not invent facts, names, numbers, or URLs.
3. Write short, neutral, factual bullets (aim ≤ 40 words each).
4. Avoid sensationalism and political bias.
5. Avoid duplicate bullets for the same story; merge multi-source coverage into one bullet with multiple sources.
6. Every bullet MUST include at least one source using an exact title and URL from the input articles.
7. Ignore ads, navigation text, and unrelated boilerplate.
8. Prefer the most newsworthy points; typically 1–4 bullets for this category.

Return ONLY valid JSON (no markdown fences) in this shape:
{
  "category": "{{CATEGORY}}",
  "bullets": [
    {
      "summary": "Short factual bullet",
      "sources": [
        { "title": "Exact article title from input", "url": "https://exact-url-from-input" }
      ]
    }
  ]
}

If nothing newsworthy can be grounded in the inputs, return {"category":"{{CATEGORY}}","bullets":[]}.`;

function truncateText(value, maxChars) {
  const s = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const max = Math.max(40, Number(maxChars) || 500);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function categoryList(categories) {
  const list =
    Array.isArray(categories) && categories.length
      ? categories
      : DEFAULT_CATEGORIES;
  return list.join(", ");
}

function buildCategorizePrompt(articles, options = {}) {
  const maxContentChars = options.maxContentChars ?? 500;
  const categories = options.categories || DEFAULT_CATEGORIES;
  const system = CATEGORIZE_SYSTEM.replace(
    "{{CATEGORIES}}",
    categoryList(categories)
  );

  const payload = (articles || []).map((a) => ({
    articleId: a.id,
    title: a.title,
    sourceName: a.sourceName,
    text: truncateText(a.content || a.snippet || "", maxContentChars),
  }));

  const user = `Articles JSON:\n${JSON.stringify(payload, null, 2)}`;
  return { system, user, combined: `${system}\n\n${user}` };
}

function buildSummarizePrompt(category, articles, options = {}) {
  const maxContentChars = options.maxContentChars ?? 500;
  const system = SUMMARIZE_SYSTEM.replace(/\{\{CATEGORY\}\}/g, category);

  const payload = (articles || []).map((a) => ({
    articleId: a.id,
    title: a.title,
    url: a.url,
    sourceName: a.sourceName,
    text: truncateText(a.content || a.snippet || "", maxContentChars),
  }));

  const user = `Articles in category "${category}":\n${JSON.stringify(
    payload,
    null,
    2
  )}`;
  return { system, user, combined: `${system}\n\n${user}` };
}

function batchArticles(articles, batchSize) {
  const size = Math.max(1, Number(batchSize) || 10);
  const batches = [];
  const list = articles || [];
  for (let i = 0; i < list.length; i += size) {
    batches.push(list.slice(i, i + size));
  }
  return batches;
}

module.exports = {
  DEFAULT_CATEGORIES,
  CATEGORIZE_SYSTEM,
  SUMMARIZE_SYSTEM,
  truncateText,
  buildCategorizePrompt,
  buildSummarizePrompt,
  batchArticles,
  categoryList,
};
