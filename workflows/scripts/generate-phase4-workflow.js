#!/usr/bin/env node
/**
 * Generates workflows/india-news-summarizer.json for Phase 6/7
 * (collection → normalize → AI → format → publish) from config/sources.json.
 *
 * Usage: node workflows/scripts/generate-phase4-workflow.js
 *
 * n8n Variables:
 *   GEMINI_API_KEY ($vars.GEMINI_API_KEY)
 *   PUBLISH_API_KEY ($vars.PUBLISH_API_KEY) — same value as Railway
 * Optional: AI_MOCK=true (dev only)
 *
 * Production publish URL:
 *   WEBSITE_PUBLISH_BASE_URL=https://your-app.vercel.app node ...
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "../..");
const sourcesPath = path.join(root, "config/sources.json");
const collectionInlinePath = path.join(root, "lib/collection/n8nInline.js");
const normalizeInlinePath = path.join(root, "lib/normalize/n8nInline.js");
const aiInlinePath = path.join(root, "lib/ai/n8nInline.js");
const formatInlinePath = path.join(root, "lib/format/n8nInline.js");
const outPath = path.join(root, "workflows/india-news-summarizer.json");

const IDS = {
  manual: "e52e1e13-c24f-4f58-91e4-72d2fb35aed1",
  schedule: "3b11ee40-d970-46a5-a02b-76f760751d3c",
  setManual: "6d610e98-51d4-4513-a344-63a1e28ab9d1",
  setScheduled: "63098cad-5dd7-43ea-a95b-5d16af516e69",
  runContext: "c0708205-ceac-49b4-b4ec-22b06445917b",
  loadConfig: "150c6749-521f-449b-8206-754ff8c1326a",
  collectAll: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  normalizeDedupe: "e5f6a7b8-c9d0-1234-ef01-345678901234",
  ifArticles: "f6a7b8c9-d0e1-2345-f012-456789012345",
  emptyGuard: "a7b8c9d0-e1f2-3456-0123-567890123456",
  endEmpty: "b8c9d0e1-f2a3-4567-1234-678901234567",
  aiProcess: "c9d0e1f2-a3b4-5678-9012-789012345678",
  ifBriefing: "d0e1f2a3-b4c5-6789-0123-890123456789",
  aiFailedGuard: "e1f2a3b4-c5d6-7890-1234-901234567890",
  endAiFail: "f2a3b4c5-d6e7-8901-2345-012345678901",
  formatBriefing: "a1a2a3a4-b5b6-7890-cdef-123456789abc",
  publishBriefing: "b2b3b4b5-c6c7-8901-def0-234567890bcd",
  done: "fba28478-03e7-4854-a7cb-56390aaddfdf",
};

const shared = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const n8nInline = fs
  .readFileSync(collectionInlinePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
const normalizeInline = fs
  .readFileSync(normalizeInlinePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
const aiInline = fs
  .readFileSync(aiInlinePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
const formatInline = fs
  .readFileSync(formatInlinePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");

const publishBase =
  process.env.WEBSITE_PUBLISH_BASE_URL || "http://localhost:3000";

const runtimeConfig = {
  timezone: shared.timezone,
  maxArticlesPerSource: shared.maxArticlesPerSource,
  maxArticlesTotal: shared.maxArticlesTotal,
  llm: shared.llm,
  website: {
    publishUrl: `${publishBase.replace(/\/$/, "")}${shared.website.publishPath}`,
    publishMethod: shared.website.publishMethod,
    authHeaderTemplate: shared.website.authHeader,
    apiKeyCredentialHint:
      "Store PUBLISH_API_KEY in n8n credentials / Header Auth; do not hardcode.",
  },
  categories: shared.categories,
  sources: shared.sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    url: s.url,
    rssUrl: s.rssUrl,
    enabled: s.enabled,
  })),
};

function uuidCode() {
  return `typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })`;
}

const runContextJs = `// Phase 1 — Build run metadata for every execution
const input = $input.first().json || {};
const mode = input.mode === 'scheduled' ? 'scheduled' : 'manual';

const now = new Date();
const timezone = 'Asia/Kolkata';

const runDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(now);

const triggeredAt = now.toISOString();
const runId = ${uuidCode()};

return [
  {
    json: {
      runId,
      runDate,
      triggeredAt,
      mode,
      timezone,
    },
  },
];
`;

const loadConfigJs = `// Phase 1 — Central config (generated from config/sources.json)
// Re-run: node workflows/scripts/generate-phase4-workflow.js
const run = $input.first().json;

const config = ${JSON.stringify(runtimeConfig, null, 2)};

const enabledSources = config.sources.filter((s) => s.enabled);

return [
  {
    json: {
      ...run,
      config: {
        ...config,
        enabledSourceCount: enabledSources.length,
      },
      phase: 'phase6-ready',
      nextPhaseHint: 'Collect → normalize → AI → format → publish',
    },
  },
];
`;

const collectAllJs = `// Phase 2 — Collect from every enabled source in one node
// (avoids HTTP fan-out pairedItem bugs that can mis-label all items as the first source)
${n8nInline}

const ctx = $input.first().json || {};
const config = ctx.config || {};
const sources = (config.sources || []).filter((s) => s.enabled);
const maxArticlesPerSource = config.maxArticlesPerSource || 2;
const fetchedAt = new Date().toISOString();
const delayMs = 200;

const articles = [];
const sourceStatuses = [];

async function fetchOne(url) {
  const maxAttempts = 3;
  const backoffMs = [1000, 2500];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await this.helpers.httpRequest({
        method: 'GET',
        url,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; IndiaNewsSummarizer/0.7; +n8n)',
          Accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
        },
        returnFullResponse: true,
        timeout: 20000,
        ignoreHttpStatusErrors: true,
      });

      const statusCode = res.statusCode ?? res.status ?? null;
      let body = res.body ?? res.data ?? '';
      if (body && typeof body === 'object') {
        body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      body = body == null ? '' : String(body);

      const retriable =
        statusCode == null || statusCode === 408 || statusCode === 429 || statusCode >= 500;
      if (retriable && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt] || 2500));
        continue;
      }

      return { statusCode, body, error: null, attempts: attempt + 1 };
    } catch (err) {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt] || 2500));
        continue;
      }
      return {
        statusCode: null,
        body: '',
        error: (err && err.message) || String(err),
        attempts: attempt + 1,
      };
    }
  }

  return {
    statusCode: null,
    body: '',
    error: 'fetch_exhausted',
    attempts: maxAttempts,
  };
}

for (let i = 0; i < sources.length; i++) {
  const source = sources[i];
  const fetchUrl = source.rssUrl || source.url;
  const fetched = await fetchOne.call(this, fetchUrl);
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

const sourcesConfigured = (config.sources || []).length;
const sourcesEnabled = sources.length;
const sourcesSucceeded = sourceStatuses.filter((s) => s.status === 'success').length;
const sourcesFailed = sourceStatuses.filter((s) => s.status === 'failed').length;
const failedSources = sourceStatuses
  .filter((s) => s.status === 'failed')
  .map((s) => ({
    sourceId: s.sourceId,
    sourceName: s.sourceName,
    error: s.error,
  }));

return [
  {
    json: {
      runId: ctx.runId,
      runDate: ctx.runDate,
      triggeredAt: ctx.triggeredAt,
      mode: ctx.mode,
      timezone: ctx.timezone,
      config,
      articles,
      sourceStatuses,
      collection: {
        sourcesConfigured,
        sourcesEnabled,
        sourcesSucceeded,
        sourcesFailed,
        articleCount: articles.length,
        failedSources,
        maxArticlesPerSource,
      },
      phase: 'phase2-collection',
      nextPhaseHint: 'Phase 3 normalize / dedupe / empty-run guard',
    },
  },
];
`;

const normalizeDedupeJs = `// Phase 3 — Normalize, exact+near dedupe, cap, emit corpus stats + guard
${normalizeInline}

const input = $input.first().json || {};
const config = input.config || {};
const rawArticles = Array.isArray(input.articles) ? input.articles : [];
const sourceStatuses = Array.isArray(input.sourceStatuses) ? input.sourceStatuses : [];

const corpusResult = buildCorpus(rawArticles, {
  sources: config.sources || [],
  maxArticlesTotal: config.maxArticlesTotal || 40,
  sourceStatuses,
});

const collection = input.collection || {};

return [
  {
    json: {
      runId: input.runId,
      runDate: input.runDate,
      triggeredAt: input.triggeredAt,
      mode: input.mode,
      timezone: input.timezone || config.timezone || 'Asia/Kolkata',
      config,
      sourceStatuses,
      collection,
      articles: corpusResult.articles,
      corpus: corpusResult.stats,
      guard: corpusResult.guard,
      articleCount: corpusResult.stats.articleCount,
      dedupedCount: corpusResult.stats.dedupedCount,
      sourceSuccessCount: corpusResult.stats.sourceSuccessCount,
      phase: 'phase3-normalize',
      nextPhaseHint: corpusResult.guard.proceed
        ? 'Phase 4 will categorize and summarize with Gemini'
        : 'Empty corpus — skipped LLM and publish (keep last good website summary)',
    },
  },
];
`;

const emptyGuardJs = `// Phase 3 — Empty corpus guard: do not call LLM; do not overwrite website
const input = $input.first().json || {};

return [
  {
    json: {
      runId: input.runId,
      runDate: input.runDate,
      triggeredAt: input.triggeredAt,
      mode: input.mode,
      timezone: input.timezone,
      config: input.config,
      sourceStatuses: input.sourceStatuses || [],
      collection: input.collection || {},
      articles: [],
      categories: [],
      corpus: input.corpus || {},
      guard: input.guard || {
        proceed: false,
        reason: 'empty_corpus',
        skipLlm: true,
        skipPublish: true,
      },
      articleCount: 0,
      dedupedCount: (input.corpus && input.corpus.dedupedCount) || 0,
      sourceSuccessCount: (input.corpus && input.corpus.sourceSuccessCount) || 0,
      phase: 'phase3-empty-guard',
      outcome: 'skipped_llm_and_publish',
      message:
        'Empty corpus after normalize/dedupe — keeping last good website summary; no LLM; no publish overwrite.',
    },
  },
];
`;

const aiProcessJs = `// Phase 4 — Stage A categorize + Stage B summarize (Gemini REST via helpers.httpRequest)
${aiInline}

const input = $input.first().json || {};
const config = input.config || {};
const articles = Array.isArray(input.articles) ? input.articles : [];

const envKey =
  typeof $vars !== 'undefined' && $vars.GEMINI_API_KEY
    ? $vars.GEMINI_API_KEY
    : '';
const forceMock =
  (typeof $vars !== 'undefined' && String($vars.AI_MOCK || '').toLowerCase() === 'true') ||
  !envKey;

const result = await aiRunPipeline(articles, {
  categories: config.categories || [],
  llm: config.llm || {},
  apiKey: envKey,
  httpRequest: this.helpers.httpRequest.bind(this.helpers),
  mock: forceMock,
  fallbackMockOnError: forceMock,
});

return [
  {
    json: {
      runId: input.runId,
      runDate: input.runDate,
      triggeredAt: input.triggeredAt,
      mode: input.mode,
      timezone: input.timezone || config.timezone || 'Asia/Kolkata',
      config,
      sourceStatuses: input.sourceStatuses || [],
      collection: input.collection || {},
      corpus: input.corpus || {},
      articles: result.articles,
      dropped: result.dropped,
      categories: result.categories,
      ai: result.ai,
      guard: {
        ...(input.guard || {}),
        ...result.guard,
      },
      articleCount: (input.corpus && input.corpus.articleCount) || articles.length,
      dedupedCount: (input.corpus && input.corpus.dedupedCount) || 0,
      sourceSuccessCount:
        (input.corpus && input.corpus.sourceSuccessCount) || 0,
      phase: 'phase4-ai',
      nextPhaseHint: result.guard.proceed
        ? 'Phase 6 will format canonical briefing JSON and publish'
        : 'AI produced no grounded categories — skip publish (keep last good summary)',
    },
  },
];
`;

const aiFailedGuardJs = `// Phase 4 — AI empty/failed briefing: do not overwrite website
const input = $input.first().json || {};

return [
  {
    json: {
      runId: input.runId,
      runDate: input.runDate,
      triggeredAt: input.triggeredAt,
      mode: input.mode,
      timezone: input.timezone,
      config: input.config,
      sourceStatuses: input.sourceStatuses || [],
      collection: input.collection || {},
      corpus: input.corpus || {},
      articles: input.articles || [],
      categories: [],
      ai: input.ai || {},
      guard: {
        proceed: false,
        reason: (input.guard && input.guard.reason) || 'ai_empty_briefing',
        skipLlm: false,
        skipPublish: true,
      },
      articleCount: input.articleCount || 0,
      phase: 'phase4-ai-failed-guard',
      outcome: 'skipped_publish',
      message:
        'AI stage produced no publishable categories — keeping last good website summary; no publish overwrite.',
    },
  },
];
`;

const formatBriefingJs = `// Phase 6 — Build canonical schemaVersion:1 briefing JSON
${formatInline}

const input = $input.first().json || {};
const formatted = formatBuildBriefing(input);

return [
  {
    json: {
      ...input,
      briefing: formatted.briefing,
      guard: {
        ...(input.guard || {}),
        ...formatted.guard,
      },
      phase: 'phase6-format',
      nextPhaseHint: formatted.guard.proceed
        ? 'Publish PUT to website API'
        : 'No publishable categories — skip publish (keep last good summary)',
    },
  },
];
`;

const publishBriefingJs = `// Phase 6/7 — PUT briefing to website API with retry/backoff
const input = $input.first().json || {};
const config = input.config || {};
const website = config.website || {};
const briefing = input.briefing;

if (!briefing || !Array.isArray(briefing.categories) || briefing.categories.length === 0) {
  return [
    {
      json: {
        ...input,
        phase: 'phase6-publish-skipped',
        outcome: 'skipped_publish',
        message: 'No briefing to publish — keeping last good website summary.',
      },
    },
  ];
}

const publishUrl = website.publishUrl;
if (!publishUrl) {
  throw new Error('Missing config.website.publishUrl');
}

const apiKey =
  typeof $vars !== 'undefined' && $vars.PUBLISH_API_KEY
    ? $vars.PUBLISH_API_KEY
    : '';
if (!apiKey) {
  throw new Error('Missing n8n Variable PUBLISH_API_KEY ($vars.PUBLISH_API_KEY)');
}

const maxAttempts = 3;
const backoffMs = [2000, 5000, 10000];
let lastError = null;
let lastStatus = null;

for (let attempt = 0; attempt < maxAttempts; attempt++) {
  try {
    const res = await this.helpers.httpRequest({
      method: website.publishMethod || 'PUT',
      url: publishUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: briefing,
      returnFullResponse: true,
      timeout: 30000,
      ignoreHttpStatusErrors: true,
    });

    const statusCode = res.statusCode ?? res.status ?? 0;
    lastStatus = statusCode;
    let body = res.body ?? res.data ?? '';
    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
    }

    if (statusCode >= 200 && statusCode < 300) {
      let parsed = null;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        parsed = { raw: body };
      }

      return [
        {
          json: {
            ...input,
            publish: {
              ok: true,
              statusCode,
              attempt: attempt + 1,
              response: parsed,
            },
            phase: 'phase6-published',
            outcome: 'published',
            message: 'Briefing published to website API.',
          },
        },
      ];
    }

    lastError = 'HTTP ' + statusCode + (body ? ': ' + String(body).slice(0, 200) : '');
    const retriable = statusCode === 408 || statusCode === 429 || statusCode >= 500;
    if (retriable && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt] || 5000));
      continue;
    }

    throw new Error('Publish failed: ' + lastError);
  } catch (err) {
    lastError = (err && err.message) || String(err);
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt] || 5000));
      continue;
    }
  }
}

throw new Error(
  'Publish failed after ' +
    maxAttempts +
    ' attempts (status=' +
    (lastStatus == null ? 'n/a' : lastStatus) +
    '): ' +
    (lastError || 'unknown')
);
`;

function setModeNode(id, name, mode, position) {
  return {
    parameters: {
      assignments: {
        assignments: [
          {
            id: crypto.randomUUID(),
            name: "mode",
            value: mode,
            type: "string",
          },
        ],
      },
      options: {},
    },
    id,
    name,
    type: "n8n-nodes-base.set",
    typeVersion: 3.4,
    position,
  };
}

function ifNode(id, name, leftExpr, position, notes) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "strict",
          version: 2,
        },
        conditions: [
          {
            id: crypto.randomUUID(),
            leftValue: leftExpr,
            rightValue: true,
            operator: {
              type: "boolean",
              operation: "true",
              singleValue: true,
            },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id,
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position,
    notes,
  };
}

const workflow = {
  name: "India News Summarizer",
  active: false,
  notes:
    "Phase 6/7: Collect → normalize → AI → format → publish. Variables: GEMINI_API_KEY, PUBLISH_API_KEY ($vars). Keep inactive until Phase 8. TZ Asia/Kolkata.",
  settings: {
    executionOrder: "v1",
    timezone: "Asia/Kolkata",
    saveManualExecutions: true,
    callerPolicy: "workflowsFromSameOwner",
    executionTimeout: 3300,
  },
  meta: {
    templateCredsSetupCompleted: true,
    phase: 6,
    description:
      "Hourly India news summarizer — format canonical JSON and publish to Railway API (Phase 7 retries)",
  },
  pinsData: {},
  versionId: crypto.randomUUID(),
  nodes: [
    {
      parameters: {},
      id: IDS.manual,
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 300],
    },
    {
      parameters: {
        rule: {
          interval: [
            {
              field: "cronExpression",
              expression: "0 * * * *",
            },
          ],
        },
      },
      id: IDS.schedule,
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 520],
      notes:
        "Every hour at minute 0. Uses workflow timezone Asia/Kolkata. Keep workflow inactive until Phase 8.",
    },
    setModeNode(IDS.setManual, "Set Mode Manual", "manual", [240, 300]),
    setModeNode(
      IDS.setScheduled,
      "Set Mode Scheduled",
      "scheduled",
      [240, 520]
    ),
    {
      parameters: { jsCode: runContextJs },
      id: IDS.runContext,
      name: "Build Run Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 400],
    },
    {
      parameters: { jsCode: loadConfigJs },
      id: IDS.loadConfig,
      name: "Load Config",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [700, 400],
    },
    {
      parameters: { jsCode: collectAllJs },
      id: IDS.collectAll,
      name: "Collect All Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [940, 400],
      notes:
        "Fetch each enabled RSS/HTML source via helpers.httpRequest (isolated). Caps maxArticlesPerSource.",
    },
    {
      parameters: { jsCode: normalizeDedupeJs },
      id: IDS.normalizeDedupe,
      name: "Normalize & Dedupe",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1180, 400],
      notes:
        "Trim/decode, canonicalize URLs, Asia/Kolkata timestamps, exact+near dedupe, maxArticlesTotal cap, corpus stats + guard flags.",
    },
    ifNode(
      IDS.ifArticles,
      "IF Articles Exist",
      "={{ $json.guard.proceed }}",
      [1420, 400],
      "True → AI categorize/summarize. False → empty-run guard (no LLM, no publish)."
    ),
    {
      parameters: { jsCode: aiProcessJs },
      id: IDS.aiProcess,
      name: "AI Categorize & Summarize",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1680, 280],
      notes:
        "Stage A+B via gemini-3.5-flash-lite. Rate limits: 15 RPM (~4.2s gap), 250K TPM, 500 RPD, max 16 req/run. Needs $vars.GEMINI_API_KEY (or $vars.AI_MOCK=true).",
    },
    ifNode(
      IDS.ifBriefing,
      "IF Briefing Ready",
      "={{ $json.guard.proceed }}",
      [1920, 280],
      "True → format + publish. False → AI failed guard (no publish overwrite)."
    ),
    {
      parameters: { jsCode: formatBriefingJs },
      id: IDS.formatBriefing,
      name: "Format Briefing JSON",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2160, 160],
      notes:
        "Build schemaVersion:1 payload (meta + categories). Strips non-contract fields.",
    },
    {
      parameters: { jsCode: publishBriefingJs },
      id: IDS.publishBriefing,
      name: "Publish to API",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2400, 160],
      notes:
        "PUT to config.website.publishUrl with Bearer PUBLISH_API_KEY. Retries 5xx/timeouts; failed runs do not wipe Railway storage.",
    },
    {
      parameters: {},
      id: IDS.done,
      name: "Done",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [2640, 160],
      notes: "Successful publish path — refresh Vercel site to verify.",
    },
    {
      parameters: { jsCode: emptyGuardJs },
      id: IDS.emptyGuard,
      name: "Empty Run Guard",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1680, 520],
      notes:
        "Log empty-run stats. Do not call LLM. Do not overwrite website latest summary.",
    },
    {
      parameters: {},
      id: IDS.endEmpty,
      name: "End Empty Run",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1920, 520],
      notes: "Terminal for empty corpus path.",
    },
    {
      parameters: { jsCode: aiFailedGuardJs },
      id: IDS.aiFailedGuard,
      name: "AI Failed Guard",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2160, 400],
      notes:
        "No grounded category bullets. Do not overwrite website latest summary.",
    },
    {
      parameters: {},
      id: IDS.endAiFail,
      name: "End AI Fail",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [2400, 400],
      notes: "Terminal for AI empty/failed path.",
    },
  ],
  connections: {
    "Manual Trigger": {
      main: [[{ node: "Set Mode Manual", type: "main", index: 0 }]],
    },
    "Schedule Trigger": {
      main: [[{ node: "Set Mode Scheduled", type: "main", index: 0 }]],
    },
    "Set Mode Manual": {
      main: [[{ node: "Build Run Context", type: "main", index: 0 }]],
    },
    "Set Mode Scheduled": {
      main: [[{ node: "Build Run Context", type: "main", index: 0 }]],
    },
    "Build Run Context": {
      main: [[{ node: "Load Config", type: "main", index: 0 }]],
    },
    "Load Config": {
      main: [[{ node: "Collect All Sources", type: "main", index: 0 }]],
    },
    "Collect All Sources": {
      main: [[{ node: "Normalize & Dedupe", type: "main", index: 0 }]],
    },
    "Normalize & Dedupe": {
      main: [[{ node: "IF Articles Exist", type: "main", index: 0 }]],
    },
    "IF Articles Exist": {
      main: [
        [{ node: "AI Categorize & Summarize", type: "main", index: 0 }],
        [{ node: "Empty Run Guard", type: "main", index: 0 }],
      ],
    },
    "AI Categorize & Summarize": {
      main: [[{ node: "IF Briefing Ready", type: "main", index: 0 }]],
    },
    "IF Briefing Ready": {
      main: [
        [{ node: "Format Briefing JSON", type: "main", index: 0 }],
        [{ node: "AI Failed Guard", type: "main", index: 0 }],
      ],
    },
    "Format Briefing JSON": {
      main: [[{ node: "Publish to API", type: "main", index: 0 }]],
    },
    "Publish to API": {
      main: [[{ node: "Done", type: "main", index: 0 }]],
    },
    "Empty Run Guard": {
      main: [[{ node: "End Empty Run", type: "main", index: 0 }]],
    },
    "AI Failed Guard": {
      main: [[{ node: "End AI Fail", type: "main", index: 0 }]],
    },
  },
};

fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, outPath)}`);
console.log(
  `phase=${workflow.meta.phase} active=${workflow.active} cron=0 * * * * tz=${workflow.settings.timezone}`
);
console.log(
  `sources=${runtimeConfig.sources.length} model=${runtimeConfig.llm.model} publishUrl=${runtimeConfig.website.publishUrl}`
);
