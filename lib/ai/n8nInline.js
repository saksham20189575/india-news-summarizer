/**
 * Self-contained Phase 4 AI helpers for n8n Code nodes.
 * Keep in sync with lib/ai/*.js — embedded by generate-phase4-workflow.js.
 */

const AI_DEFAULT_CATEGORIES = [
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

const AI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
const AI_DEFAULT_RPM = 15;
const AI_DEFAULT_TPM = 250000;
const AI_DEFAULT_RPD = 500;

function aiSleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function aiEstimateTokens(text, outputReserve) {
  const chars = String(text || "").length;
  return Math.ceil(chars / 4) + Math.max(64, Number(outputReserve) || 800);
}

function aiCreateRateLimiter(limits) {
  limits = limits || {};
  const rpm = Math.max(1, Number(limits.requestsPerMinute) || AI_DEFAULT_RPM);
  const tpm = Math.max(1000, Number(limits.tokensPerMinute) || AI_DEFAULT_TPM);
  const rpd = Math.max(1, Number(limits.requestsPerDay) || AI_DEFAULT_RPD);
  const minGapMs =
    typeof limits.minRequestGapMs === "number"
      ? Math.max(0, limits.minRequestGapMs)
      : Math.ceil(60000 / rpm) + 200;
  const maxRequestsPerRun =
    typeof limits.maxRequestsPerRun === "number"
      ? Math.max(1, limits.maxRequestsPerRun)
      : Math.min(16, Math.floor(rpd / 24));

  let lastRequestAt = 0;
  const minuteWindow = [];
  let day = new Date().toISOString().slice(0, 10);
  let dayCount = 0;
  let runCount = 0;

  function prune(now) {
    const cutoff = now - 60000;
    while (minuteWindow.length && minuteWindow[0].at < cutoff) {
      minuteWindow.shift();
    }
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
  }

  async function acquire(estimatedTokens) {
    const tokens = Math.max(1, Number(estimatedTokens) || 1);
    prune(Date.now());
    if (runCount >= maxRequestsPerRun) {
      const err = new Error(
        "rate_limit_run: max " + maxRequestsPerRun + " Gemini requests per run"
      );
      err.code = "rate_limit_run";
      throw err;
    }
    if (dayCount >= rpd) {
      const err = new Error(
        "rate_limit_day: max " + rpd + " Gemini requests per day"
      );
      err.code = "rate_limit_day";
      throw err;
    }
    for (;;) {
      const now = Date.now();
      prune(now);
      let usedTokens = 0;
      for (let i = 0; i < minuteWindow.length; i++) {
        usedTokens += minuteWindow[i].tokens;
      }
      let waitMs = 0;
      if (lastRequestAt && now - lastRequestAt < minGapMs) {
        waitMs = Math.max(waitMs, minGapMs - (now - lastRequestAt));
      }
      if (minuteWindow.length >= rpm) {
        waitMs = Math.max(waitMs, minuteWindow[0].at + 60000 - now + 50);
      }
      if (usedTokens + tokens > tpm) {
        waitMs = Math.max(
          waitMs,
          minuteWindow[0] ? minuteWindow[0].at + 60000 - now + 50 : minGapMs
        );
      }
      if (waitMs <= 0) break;
      await aiSleep(waitMs);
    }
    const at = Date.now();
    lastRequestAt = at;
    minuteWindow.push({ at: at, tokens: tokens });
    dayCount += 1;
    runCount += 1;
    return { runCount: runCount, dayCount: dayCount };
  }

  function remainingRunBudget() {
    return Math.max(0, maxRequestsPerRun - runCount);
  }

  function getStats() {
    prune(Date.now());
    let minuteTokens = 0;
    for (let i = 0; i < minuteWindow.length; i++) {
      minuteTokens += minuteWindow[i].tokens;
    }
    return {
      requestsPerMinuteLimit: rpm,
      tokensPerMinuteLimit: tpm,
      requestsPerDayLimit: rpd,
      minGapMs: minGapMs,
      maxRequestsPerRun: maxRequestsPerRun,
      runCount: runCount,
      dayCount: dayCount,
      minuteRequests: minuteWindow.length,
      minuteTokens: minuteTokens,
    };
  }

  return {
    acquire: acquire,
    remainingRunBudget: remainingRunBudget,
    getStats: getStats,
    maxRequestsPerRun: maxRequestsPerRun,
  };
}

function aiTruncateText(value, maxChars) {
  const s = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const max = Math.max(40, Number(maxChars) || 500);
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function aiStripFences(text) {
  let s = String(text || "").trim();
  if (!s) return "";
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  return s;
}

function aiExtractJsonObject(text) {
  const s = aiStripFences(text);
  if (!s) {
    const err = new Error("empty_llm_text");
    err.code = "empty_llm_text";
    throw err;
  }
  try {
    return JSON.parse(s);
  } catch (_) {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const err = new Error("no_json_object");
    err.code = "no_json_object";
    throw err;
  }
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    const err = new Error("json_parse_failed: " + e.message);
    err.code = "json_parse_failed";
    throw err;
  }
}

function aiBuildCategorizePrompt(articles, options) {
  const categories = (options && options.categories) || AI_DEFAULT_CATEGORIES;
  const maxContentChars = (options && options.maxContentChars) || 500;
  const system =
    "You are a news categorization assistant for Indian news briefings.\n\n" +
    "Assign each article exactly one category from this enum:\n" +
    categories.join(", ") +
    "\n\nRules:\n" +
    "1. Use only the provided title, snippet/content, and source name.\n" +
    "2. Do not invent facts.\n" +
    "3. Prefer the most specific matching category.\n" +
    "4. Weather covers weather and environment.\n" +
    "5. Return confidence between 0 and 1, and optional importance between 0 and 1.\n\n" +
    "Return ONLY valid JSON (no markdown fences) in this shape:\n" +
    '{"assignments":[{"articleId":"string","category":"Politics","confidence":0.86,"importance":0.7}]}\n\n' +
    "Include one assignment per input articleId. Do not invent articleIds.";

  const payload = (articles || []).map(function (a) {
    return {
      articleId: a.id,
      title: a.title,
      sourceName: a.sourceName,
      text: aiTruncateText(a.content || a.snippet || "", maxContentChars),
    };
  });
  const user = "Articles JSON:\n" + JSON.stringify(payload, null, 2);
  return system + "\n\n" + user;
}

function aiBuildSummarizePrompt(category, articles, options) {
  const maxContentChars = (options && options.maxContentChars) || 500;
  const system =
    "You are an AI news summarization assistant for an India hourly briefing.\n\n" +
    "Category to summarize: " +
    category +
    "\n\nRules:\n" +
    "1. Use only the article information provided below.\n" +
    "2. Do not invent facts, names, numbers, or URLs.\n" +
    "3. Write short, neutral, factual bullets (aim ≤ 40 words each).\n" +
    "4. Avoid sensationalism and political bias.\n" +
    "5. Avoid duplicate bullets for the same story; merge multi-source coverage into one bullet with multiple sources.\n" +
    "6. Every bullet MUST include at least one source using an exact title and URL from the input articles.\n" +
    "7. Ignore ads, navigation text, and unrelated boilerplate.\n" +
    "8. Prefer the most newsworthy points; typically 1–4 bullets for this category.\n\n" +
    "Return ONLY valid JSON (no markdown fences) in this shape:\n" +
    '{"category":"' +
    category +
    '","bullets":[{"summary":"Short factual bullet","sources":[{"title":"Exact article title from input","url":"https://exact-url-from-input"}]}]}\n\n' +
    'If nothing newsworthy can be grounded in the inputs, return {"category":"' +
    category +
    '","bullets":[]}.';

  const payload = (articles || []).map(function (a) {
    return {
      articleId: a.id,
      title: a.title,
      url: a.url,
      sourceName: a.sourceName,
      text: aiTruncateText(a.content || a.snippet || "", maxContentChars),
    };
  });
  const user =
    'Articles in category "' +
    category +
    '":\n' +
    JSON.stringify(payload, null, 2);
  return system + "\n\n" + user;
}

function aiBatchArticles(articles, batchSize) {
  const size = Math.max(1, Number(batchSize) || 10);
  const batches = [];
  const list = articles || [];
  for (let i = 0; i < list.length; i += size) {
    batches.push(list.slice(i, i + size));
  }
  return batches;
}

function aiNormalizeCategory(raw, allowed) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  for (let i = 0; i < allowed.length; i++) {
    if (allowed[i].toLowerCase() === s) return allowed[i];
  }
  return null;
}

function aiClamp01(n, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function aiApplyCategorization(articles, llmPayload, options) {
  const allowed = (options && options.categories) || AI_DEFAULT_CATEGORIES;
  const minConfidence =
    options && typeof options.minConfidence === "number"
      ? options.minConfidence
      : 0.35;
  const byId = new Map();
  (articles || []).forEach(function (a) {
    byId.set(a.id, a);
  });
  const assignments =
    llmPayload && Array.isArray(llmPayload.assignments)
      ? llmPayload.assignments
      : [];
  const categorized = [];
  const dropped = [];
  const seen = new Set();
  let lowConfidence = 0;
  let unknownCategory = 0;

  for (let i = 0; i < assignments.length; i++) {
    const row = assignments[i];
    const articleId = row && row.articleId;
    if (!articleId || !byId.has(articleId) || seen.has(articleId)) {
      continue;
    }
    seen.add(articleId);
    const category = aiNormalizeCategory(row.category, allowed);
    const confidence = aiClamp01(row.confidence, 0.5);
    const importance = aiClamp01(row.importance, null);
    if (!category) {
      unknownCategory += 1;
      dropped.push({
        articleId: articleId,
        reason: "unknown_category",
        rawCategory: row.category,
      });
      continue;
    }
    if (confidence < minConfidence) {
      lowConfidence += 1;
      dropped.push({
        articleId: articleId,
        reason: "low_confidence",
        category: category,
        confidence: confidence,
      });
      continue;
    }
    const base = byId.get(articleId);
    categorized.push(
      Object.assign({}, base, {
        category: category,
        confidence: confidence,
        importance: importance,
      })
    );
  }

  (articles || []).forEach(function (a) {
    if (!seen.has(a.id)) {
      dropped.push({ articleId: a.id, reason: "missing_assignment" });
    }
  });

  return {
    articles: categorized,
    dropped: dropped,
    stats: {
      inputCount: (articles || []).length,
      categorizedCount: categorized.length,
      droppedCount: dropped.length,
      unknownCategory: unknownCategory,
      lowConfidence: lowConfidence,
      minConfidence: minConfidence,
    },
  };
}

function aiGroupByCategory(articles, categories) {
  const order = categories || AI_DEFAULT_CATEGORIES;
  const map = new Map();
  order.forEach(function (c) {
    map.set(c, []);
  });
  (articles || []).forEach(function (a) {
    if (a.category && map.has(a.category)) map.get(a.category).push(a);
  });
  const groups = [];
  order.forEach(function (category) {
    const items = map.get(category) || [];
    if (items.length) groups.push({ category: category, articles: items });
  });
  return groups;
}

function aiNormalizeUrl(u) {
  try {
    const url = new URL(String(u || "").trim());
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (_) {
    return String(u || "").trim();
  }
}

function aiSanitizeCategorySummary(category, llmPayload, articles) {
  const byUrl = new Map();
  const byTitle = new Map();
  (articles || []).forEach(function (a) {
    const key = aiNormalizeUrl(a.url);
    if (key) byUrl.set(key, a);
    if (a.url) byUrl.set(String(a.url).trim(), a);
    byTitle.set(
      String(a.title || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
      a
    );
  });

  const rawBullets =
    llmPayload && Array.isArray(llmPayload.bullets) ? llmPayload.bullets : [];
  const bullets = [];
  let droppedNoSources = 0;

  for (let i = 0; i < rawBullets.length; i++) {
    const bullet = rawBullets[i];
    const summary = String((bullet && bullet.summary) || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!summary) continue;
    const rawSources = Array.isArray(bullet.sources) ? bullet.sources : [];
    const sources = [];
    const seen = new Set();

    for (let j = 0; j < rawSources.length; j++) {
      const s = rawSources[j];
      const url = aiNormalizeUrl(s && s.url);
      let article = byUrl.get(url) || byUrl.get(String((s && s.url) || "").trim());
      if (!article) {
        const title = String((s && s.title) || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        article = byTitle.get(title);
      }
      if (!article) continue;
      const key = aiNormalizeUrl(article.url);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ title: article.title, url: article.url });
    }

    if (!sources.length) {
      droppedNoSources += 1;
      continue;
    }
    bullets.push({ summary: summary, sources: sources });
  }

  return {
    category: category,
    bullets: bullets,
    stats: {
      rawBulletCount: rawBullets.length,
      keptBulletCount: bullets.length,
      droppedNoSources: droppedNoSources,
    },
  };
}

function aiMergeBriefingCategories(categoryResults) {
  const categories = [];
  (categoryResults || []).forEach(function (r) {
    if (!r || !r.category) return;
    if (!Array.isArray(r.bullets) || !r.bullets.length) return;
    categories.push({ category: r.category, bullets: r.bullets });
  });
  return categories;
}

function aiMockCategorizeText(articles, categories) {
  const allowed = categories || AI_DEFAULT_CATEGORIES;
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
  const assignments = (articles || []).map(function (a) {
    const hay = (a.title || "") + " " + (a.snippet || "") + " " + (a.content || "");
    let category = "Politics";
    for (let i = 0; i < rules.length; i++) {
      if (rules[i][0].test(hay) && allowed.indexOf(rules[i][1]) >= 0) {
        category = rules[i][1];
        break;
      }
    }
    return {
      articleId: a.id,
      category: category,
      confidence: 0.78,
      importance: 0.6,
    };
  });
  return JSON.stringify({ assignments: assignments });
}

function aiMockSummarizeText(category, articles) {
  const bullets = (articles || []).slice(0, 3).map(function (a) {
    return {
      summary: String(a.title || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
      sources: [{ title: a.title, url: a.url }],
    };
  });
  return JSON.stringify({ category: category, bullets: bullets });
}

function aiExtractGeminiText(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts;
  if (!Array.isArray(parts) || !parts.length) {
    const err = new Error("gemini_empty_candidates");
    err.code = "gemini_empty_candidates";
    throw err;
  }
  const texts = parts
    .filter(function (p) {
      return p && p.text && !p.thought;
    })
    .map(function (p) {
      return p.text;
    });
  return (texts.length
    ? texts
    : parts.map(function (p) {
        return p.text || "";
      })
  )
    .join("")
    .trim();
}

async function aiGeminiGenerate(prompt, options) {
  const apiKey = (options && options.apiKey) || "";
  if (!apiKey) {
    const err = new Error("missing_gemini_api_key");
    err.code = "missing_gemini_api_key";
    throw err;
  }
  const model = (options && options.model) || AI_DEFAULT_MODEL;
  const thinkingLevel =
    (options && options.thinkingLevel) || "minimal";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingLevel: String(thinkingLevel).toLowerCase(),
      },
    },
  };

  const httpRequest = options.httpRequest;
  const res = await httpRequest({
    method: "POST",
    url: url,
    headers: { "Content-Type": "application/json" },
    body: body,
    json: true,
    timeout: (options && options.timeout) || 60000,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });

  const statusCode = res.statusCode != null ? res.statusCode : res.status || 0;
  let data = res.body != null ? res.body : res.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (_) {}
  }
  if (statusCode < 200 || statusCode >= 300) {
    const err = new Error(
      "gemini_http_" +
        statusCode +
        ": " +
        (typeof data === "string"
          ? data.slice(0, 200)
          : JSON.stringify(data).slice(0, 200))
    );
    err.code = "gemini_http_error";
    err.statusCode = statusCode;
    throw err;
  }
  return aiExtractGeminiText(data);
}

async function aiWithRetry(fn, maxRetries) {
  const attempts = Math.max(0, Number(maxRetries) || 0) + 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      const status = err && err.statusCode;
      if (i < attempts - 1) {
        const wait =
          status === 429
            ? Math.min(60000, (Math.ceil(60000 / AI_DEFAULT_RPM) + 500) * (i + 1))
            : Math.min(10000, 500 * Math.pow(2, i));
        await aiSleep(wait);
      }
    }
  }
  throw lastErr;
}

/**
 * Full Stage A + B for n8n Code node.
 * options: { categories, llm config fields, apiKey, httpRequest, mock }
 */
async function aiRunPipeline(articles, options) {
  options = options || {};
  const categories = options.categories || AI_DEFAULT_CATEGORIES;
  const llm = options.llm || {};
  const model = llm.model || AI_DEFAULT_MODEL;
  const batchSize = llm.categorizeBatchSize || 10;
  const maxContentChars = llm.maxContentChars || 500;
  const minConfidence =
    typeof llm.minConfidence === "number" ? llm.minConfidence : 0.35;
  const maxRetries = typeof llm.maxRetries === "number" ? llm.maxRetries : 1;
  const thinkingLevel = llm.thinkingLevel || "minimal";
  const useMock = Boolean(options.mock);
  const rateLimits = Object.assign(
    {
      requestsPerMinute: AI_DEFAULT_RPM,
      tokensPerMinute: AI_DEFAULT_TPM,
      requestsPerDay: AI_DEFAULT_RPD,
    },
    llm.rateLimits || {}
  );
  if (typeof llm.maxRequestsPerRun === "number") {
    rateLimits.maxRequestsPerRun = llm.maxRequestsPerRun;
  }
  if (typeof llm.minRequestGapMs === "number") {
    rateLimits.minRequestGapMs = llm.minRequestGapMs;
  }
  const limiter = useMock ? null : aiCreateRateLimiter(rateLimits);

  const callLlm = async function (prompt, mockText) {
    if (useMock) return mockText;
    if (limiter) await limiter.acquire(aiEstimateTokens(prompt, 800));
    return aiGeminiGenerate(prompt, {
      apiKey: options.apiKey,
      model: model,
      thinkingLevel: thinkingLevel,
      httpRequest: options.httpRequest,
      timeout: llm.timeoutMs || 60000,
    });
  };

  const batches = aiBatchArticles(articles, batchSize);
  const allAssignments = [];
  const errors = [];
  const skipped = [];

  for (let bi = 0; bi < batches.length; bi++) {
    if (limiter && limiter.remainingRunBudget() <= 0) {
      errors.push({
        stage: "categorize",
        batch: bi,
        error: "rate_limit_run budget exhausted",
        code: "rate_limit_run",
      });
      break;
    }
    const batch = batches[bi];
    const prompt = aiBuildCategorizePrompt(batch, {
      categories: categories,
      maxContentChars: maxContentChars,
    });
    try {
      const text = await aiWithRetry(async function () {
        const raw = await callLlm(prompt, aiMockCategorizeText(batch, categories));
        const parsed = aiExtractJsonObject(raw);
        if (!parsed || !Array.isArray(parsed.assignments)) {
          const err = new Error("categorize_missing_assignments");
          err.code = "categorize_missing_assignments";
          throw err;
        }
        return raw;
      }, maxRetries);
      const parsed = aiExtractJsonObject(text);
      allAssignments.push.apply(allAssignments, parsed.assignments);
    } catch (err) {
      errors.push({
        stage: "categorize",
        batch: bi,
        error: (err && err.message) || String(err),
        code: err && err.code,
      });
      if (options.fallbackMockOnError || useMock) {
        const parsed = aiExtractJsonObject(
          aiMockCategorizeText(batch, categories)
        );
        allAssignments.push.apply(allAssignments, parsed.assignments);
      }
    }
  }

  const applied = aiApplyCategorization(
    articles,
    { assignments: allAssignments },
    { categories: categories, minConfidence: minConfidence }
  );
  let groups = aiGroupByCategory(applied.articles, categories);
  const sumResults = [];

  if (limiter) {
    const budget = limiter.remainingRunBudget();
    const maxGroups = Math.max(0, Math.floor(budget / (maxRetries + 1)));
    if (maxGroups < groups.length) {
      const ordered = groups.slice().sort(function (a, b) {
        return (b.articles || []).length - (a.articles || []).length;
      });
      const chosen = ordered.slice(0, maxGroups);
      const chosenSet = {};
      chosen.forEach(function (g) {
        chosenSet[g.category] = true;
      });
      groups.forEach(function (g) {
        if (!chosenSet[g.category]) {
          skipped.push({
            category: g.category,
            reason: "rate_limit_run",
            articleCount: (g.articles || []).length,
          });
        }
      });
      groups = chosen;
    }
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (limiter && limiter.remainingRunBudget() <= 0) {
      skipped.push({
        category: group.category,
        reason: "rate_limit_run",
        articleCount: (group.articles || []).length,
      });
      continue;
    }
    const prompt = aiBuildSummarizePrompt(group.category, group.articles, {
      maxContentChars: maxContentChars,
    });
    try {
      const text = await aiWithRetry(async function () {
        const raw = await callLlm(
          prompt,
          aiMockSummarizeText(group.category, group.articles)
        );
        const parsed = aiExtractJsonObject(raw);
        if (!parsed || !Array.isArray(parsed.bullets)) {
          const err = new Error("summarize_missing_bullets");
          err.code = "summarize_missing_bullets";
          throw err;
        }
        return raw;
      }, maxRetries);
      const parsed = aiExtractJsonObject(text);
      sumResults.push(
        aiSanitizeCategorySummary(group.category, parsed, group.articles)
      );
    } catch (err) {
      errors.push({
        stage: "summarize",
        category: group.category,
        error: (err && err.message) || String(err),
        code: err && err.code,
      });
      if (options.fallbackMockOnError || useMock) {
        const parsed = aiExtractJsonObject(
          aiMockSummarizeText(group.category, group.articles)
        );
        sumResults.push(
          aiSanitizeCategorySummary(group.category, parsed, group.articles)
        );
      }
    }
  }

  const briefingCategories = aiMergeBriefingCategories(sumResults);
  const ok = briefingCategories.length > 0;

  return {
    articles: applied.articles,
    dropped: applied.dropped,
    groups: groups,
    categories: briefingCategories,
    ai: {
      model: useMock ? "mock" : model,
      mock: useMock,
      thinkingLevel: thinkingLevel,
      categorizedCount: applied.stats.categorizedCount,
      droppedCount: applied.stats.droppedCount,
      lowConfidence: applied.stats.lowConfidence,
      groupCount: groups.length,
      summarizedCategories: briefingCategories.length,
      skippedCategories: skipped,
      errors: errors,
      categorizeStats: applied.stats,
      summarizeStats: sumResults.map(function (r) {
        return Object.assign({ category: r.category }, r.stats);
      }),
      rateLimit: limiter ? limiter.getStats() : { mock: true },
    },
    guard: {
      proceed: ok,
      reason: ok ? null : "ai_empty_briefing",
      skipLlm: false,
      skipPublish: !ok,
    },
  };
}
