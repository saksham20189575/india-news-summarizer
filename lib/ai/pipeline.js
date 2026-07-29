/**
 * Phase 4 pipeline: categorize → group → summarize → merge.
 * Respects Gemini rate limits (default: 15 RPM / 250K TPM / 500 RPD).
 */

const { generateContent, DEFAULT_MODEL } = require("./gemini");
const {
  createRateLimiter,
  estimateTokens,
  retryBackoffMs,
  sleep,
  DEFAULT_LIMITS,
} = require("./rateLimit");
const {
  DEFAULT_CATEGORIES,
  buildCategorizePrompt,
  buildSummarizePrompt,
  batchArticles,
} = require("./prompts");
const {
  applyCategorization,
  parseCategorizeResponse,
  groupByCategory,
} = require("./categorize");
const {
  sanitizeCategorySummary,
  parseSummarizeResponse,
  mergeBriefingCategories,
} = require("./summarize");

async function withRetry(fn, maxRetries, options = {}) {
  const attempts = Math.max(0, Number(maxRetries) || 0) + 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      const status = err && err.statusCode;
      const retriable =
        status === 429 ||
        status === 503 ||
        (err && err.code === "gemini_http_error" && status >= 500);
      if (i < attempts - 1 && (retriable || status === 429)) {
        await sleep(retryBackoffMs(i, status));
        continue;
      }
      if (i < attempts - 1 && options.retryAll) {
        await sleep(retryBackoffMs(i, status));
        continue;
      }
      // parse failures: retry once without long backoff
      if (i < attempts - 1) {
        await sleep(250);
      }
    }
  }
  throw lastErr;
}

function mockCategorizeText(articles, categories) {
  const allowed = categories || DEFAULT_CATEGORIES;
  const rules = [
    [/cricket|football|match|sport|ipl|athlete/i, "Sports"],
    [/stock|market|bank|gdp|rupee|business|economy|tatkal|railway/i, "Business"],
    [/ai |tech|app|software|cyber|scientist/i, "Technology"],
    [/film|movie|actor|entertainment|bollywood/i, "Entertainment"],
    [/hospital|health|doctor|medical|vaccine|disease/i, "Health"],
    [/school|university|education|student|teacher|minister.*education/i, "Education"],
    [/crime|arrest|police|murder|theft|fir\b/i, "Crime"],
    [/weather|rain|flood|cyclone|heatwave|environment|waste|clean-up/i, "Weather"],
    [/un |ukraine|gaza|china|pakistan|world |global|international/i, "World"],
    [/minister|parliament|election|bjp|congress|cabinet|court|law|cm\b|pm\b/i, "Politics"],
  ];

  const assignments = (articles || []).map((a) => {
    const hay = `${a.title || ""} ${a.snippet || ""} ${a.content || ""}`;
    let category = "Politics";
    for (const [re, cat] of rules) {
      if (re.test(hay) && allowed.includes(cat)) {
        category = cat;
        break;
      }
    }
    return {
      articleId: a.id,
      category,
      confidence: 0.78,
      importance: 0.6,
    };
  });

  return JSON.stringify({ assignments });
}

function mockSummarizeText(category, articles) {
  const bullets = (articles || []).slice(0, 3).map((a) => ({
    summary: String(a.title || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160),
    sources: [{ title: a.title, url: a.url }],
  }));
  return JSON.stringify({ category, bullets });
}

async function callLlm(prompt, options) {
  if (options.mock) {
    return options.mockFn(prompt);
  }

  const limiter = options.rateLimiter;
  if (limiter) {
    await limiter.acquire(estimateTokens(prompt, 800));
  }

  const result = await generateContent({
    prompt,
    apiKey: options.apiKey,
    model: options.model,
    thinkingLevel: options.thinkingLevel || "minimal",
    temperature: options.temperature,
    includeTemperature: Boolean(options.includeTemperature),
    httpRequest: options.httpRequest,
    fetchImpl: options.fetchImpl,
    timeout: options.timeout,
  });

  return typeof result === "string" ? result : result.text;
}

/** Prefer larger / higher-importance groups when run budget is tight. */
function prioritizeGroups(groups, maxGroups) {
  const list = [...(groups || [])];
  list.sort((a, b) => {
    const ia = (a.articles || []).reduce(
      (s, x) => s + (Number(x.importance) || 0.5),
      0
    );
    const ib = (b.articles || []).reduce(
      (s, x) => s + (Number(x.importance) || 0.5),
      0
    );
    if (ib !== ia) return ib - ia;
    return (b.articles || []).length - (a.articles || []).length;
  });
  if (typeof maxGroups === "number" && maxGroups >= 0) {
    return list.slice(0, maxGroups);
  }
  return list;
}

async function categorizeCorpus(articles, options = {}) {
  const categories = options.categories || DEFAULT_CATEGORIES;
  const batchSize = options.categorizeBatchSize || 10;
  const maxRetries = options.maxRetries ?? 1;
  const batches = batchArticles(articles, batchSize);
  const allAssignments = [];
  const errors = [];

  for (let bi = 0; bi < batches.length; bi++) {
    if (options.rateLimiter && options.rateLimiter.remainingRunBudget() <= 0) {
      errors.push({
        stage: "categorize",
        batch: bi,
        error: "rate_limit_run budget exhausted",
        code: "rate_limit_run",
      });
      break;
    }

    const batch = batches[bi];
    const { combined } = buildCategorizePrompt(batch, {
      categories,
      maxContentChars: options.maxContentChars,
    });

    try {
      const text = await withRetry(async () => {
        const raw = await callLlm(combined, {
          ...options,
          mockFn: () => mockCategorizeText(batch, categories),
        });
        parseCategorizeResponse(raw);
        return raw;
      }, maxRetries);

      const parsed = parseCategorizeResponse(text);
      allAssignments.push(...parsed.assignments);
    } catch (err) {
      errors.push({
        stage: "categorize",
        batch: bi,
        error: (err && err.message) || String(err),
        code: err && err.code,
      });
      if (options.fallbackMockOnError) {
        const parsed = parseCategorizeResponse(
          mockCategorizeText(batch, categories)
        );
        allAssignments.push(...parsed.assignments);
      }
    }
  }

  const applied = applyCategorization(
    articles,
    { assignments: allAssignments },
    {
      categories,
      minConfidence: options.minConfidence,
    }
  );

  return {
    ...applied,
    errors,
  };
}

async function summarizeGroups(groups, options = {}) {
  const maxRetries = options.maxRetries ?? 1;
  const results = [];
  const errors = [];
  const skipped = [];

  let work = groups || [];
  if (options.rateLimiter) {
    // Reserve at least 0 — budget already spent on categorize.
    // Leave headroom for 1 retry per call by taking floor(remaining / 1).
    const budget = options.rateLimiter.remainingRunBudget();
    // Assume worst case: each group may need maxRetries+1 attempts → be conservative
    const maxGroups = Math.max(0, Math.floor(budget / (maxRetries + 1)));
    if (maxGroups < work.length) {
      const chosen = prioritizeGroups(work, maxGroups);
      const chosenSet = new Set(chosen.map((g) => g.category));
      for (const g of work) {
        if (!chosenSet.has(g.category)) {
          skipped.push({
            category: g.category,
            reason: "rate_limit_run",
            articleCount: (g.articles || []).length,
          });
        }
      }
      work = chosen;
    }
  }

  for (const group of work) {
    if (options.rateLimiter && options.rateLimiter.remainingRunBudget() <= 0) {
      skipped.push({
        category: group.category,
        reason: "rate_limit_run",
        articleCount: (group.articles || []).length,
      });
      continue;
    }

    const { combined } = buildSummarizePrompt(group.category, group.articles, {
      maxContentChars: options.maxContentChars,
    });

    try {
      const text = await withRetry(async () => {
        const raw = await callLlm(combined, {
          ...options,
          mockFn: () => mockSummarizeText(group.category, group.articles),
        });
        parseSummarizeResponse(raw);
        return raw;
      }, maxRetries);

      const parsed = parseSummarizeResponse(text);
      const sanitized = sanitizeCategorySummary(
        group.category,
        parsed,
        group.articles
      );
      results.push(sanitized);
    } catch (err) {
      errors.push({
        stage: "summarize",
        category: group.category,
        error: (err && err.message) || String(err),
        code: err && err.code,
      });
      if (options.fallbackMockOnError) {
        const parsed = parseSummarizeResponse(
          mockSummarizeText(group.category, group.articles)
        );
        results.push(
          sanitizeCategorySummary(group.category, parsed, group.articles)
        );
      }
    }
  }

  return { results, errors, skipped };
}

/**
 * Full Stage A + B pipeline.
 */
async function runAiPipeline(articles, options = {}) {
  const categories = options.categories || DEFAULT_CATEGORIES;
  const model = options.model || DEFAULT_MODEL;

  const rateLimits = {
    ...DEFAULT_LIMITS,
    ...(options.rateLimits || {}),
  };
  if (typeof options.maxRequestsPerRun === "number") {
    rateLimits.maxRequestsPerRun = options.maxRequestsPerRun;
  }
  if (typeof options.minRequestGapMs === "number") {
    rateLimits.minRequestGapMs = options.minRequestGapMs;
  }

  const rateLimiter = options.mock
    ? null
    : options.rateLimiter || createRateLimiter(rateLimits);

  const opts = {
    ...options,
    model,
    rateLimiter,
    thinkingLevel: options.thinkingLevel || "minimal",
  };

  const cat = await categorizeCorpus(articles, opts);
  const groups = groupByCategory(cat.articles, categories);
  const sum = await summarizeGroups(groups, opts);
  const briefingCategories = mergeBriefingCategories(sum.results);

  const errors = [...(cat.errors || []), ...(sum.errors || [])];
  const ok = briefingCategories.length > 0;

  return {
    articles: cat.articles,
    dropped: cat.dropped,
    groups,
    categories: briefingCategories,
    ai: {
      model: options.mock ? "mock" : model,
      mock: Boolean(options.mock),
      thinkingLevel: opts.thinkingLevel,
      categorizedCount: cat.stats.categorizedCount,
      droppedCount: cat.stats.droppedCount,
      lowConfidence: cat.stats.lowConfidence,
      groupCount: groups.length,
      summarizedCategories: briefingCategories.length,
      skippedCategories: sum.skipped || [],
      errors,
      categorizeStats: cat.stats,
      summarizeStats: sum.results.map((r) => ({
        category: r.category,
        ...r.stats,
      })),
      rateLimit: rateLimiter ? rateLimiter.getStats() : { mock: true },
    },
    guard: {
      proceed: ok,
      reason: ok ? null : "ai_empty_briefing",
      skipLlm: false,
      skipPublish: !ok,
    },
  };
}

module.exports = {
  withRetry,
  mockCategorizeText,
  mockSummarizeText,
  categorizeCorpus,
  summarizeGroups,
  runAiPipeline,
  prioritizeGroups,
  extractJsonObject: require("./parseJson").extractJsonObject,
  applyCategorization,
  groupByCategory,
  sanitizeCategorySummary,
  mergeBriefingCategories,
  buildCategorizePrompt,
  buildSummarizePrompt,
  parseCategorizeResponse,
  parseSummarizeResponse,
};
