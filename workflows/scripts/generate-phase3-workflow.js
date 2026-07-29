#!/usr/bin/env node
/**
 * Generates workflows/india-news-summarizer.json for Phase 3
 * (collection + normalize/dedupe/cap + empty-run guard) from config/sources.json.
 *
 * Usage: node workflows/scripts/generate-phase3-workflow.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "../..");
const sourcesPath = path.join(root, "config/sources.json");
const collectionInlinePath = path.join(root, "lib/collection/n8nInline.js");
const normalizeInlinePath = path.join(root, "lib/normalize/n8nInline.js");
const outPath = path.join(root, "workflows/india-news-summarizer.json");

const IDS = {
  manual: "e52e1e13-c24f-4f58-91e4-72d2fb35aed1",
  schedule: "3b11ee40-d970-46a5-a02b-76f760751d3c",
  setManual: "6d610e98-51d4-4513-a344-63a1e28ab9d1",
  setScheduled: "63098cad-5dd7-43ea-a95b-5d16af516e69",
  runContext: "c0708205-ceac-49b4-b4ec-22b06445917b",
  loadConfig: "150c6749-521f-449b-8206-754ff8c1326a",
  // Single-node collector avoids n8n HTTP fan-out item-pairing bugs
  // (which could tag every feed as the first source, e.g. India Today only).
  collectAll: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  normalizeDedupe: "e5f6a7b8-c9d0-1234-ef01-345678901234",
  ifArticles: "f6a7b8c9-d0e1-2345-f012-456789012345",
  emptyGuard: "a7b8c9d0-e1f2-3456-0123-567890123456",
  endEmpty: "b8c9d0e1-f2a3-4567-1234-678901234567",
  done: "fba28478-03e7-4854-a7cb-56390aaddfdf",
};

const shared = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const n8nInline = fs
  .readFileSync(collectionInlinePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "");
const normalizeInline = fs
  .readFileSync(normalizeInlinePath, "utf8")
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
// Re-run: node workflows/scripts/generate-phase3-workflow.js
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
      phase: 'phase3-normalize',
      nextPhaseHint: 'Phase 4 will categorize and summarize with Gemini',
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
  try {
    const res = await this.helpers.httpRequest({
      method: 'GET',
      url,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; IndiaNewsSummarizer/0.3; +n8n)',
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

    return { statusCode, body, error: null };
  } catch (err) {
    return {
      statusCode: null,
      body: '',
      error: (err && err.message) || String(err),
    };
  }
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
      // Convenience fields for IF / later meta
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

const workflow = {
  name: "India News Summarizer",
  active: false,
  notes:
    "Phase 3: Collect All Sources (2/source) → normalize/dedupe → IF articles → continue or empty guard. Keep inactive until Phase 8. TZ Asia/Kolkata.",
  settings: {
    executionOrder: "v1",
    timezone: "Asia/Kolkata",
    saveManualExecutions: true,
    callerPolicy: "workflowsFromSameOwner",
    executionTimeout: 3300,
  },
  meta: {
    templateCredsSetupCompleted: true,
    phase: 3,
    description:
      "Hourly India news summarizer — Phase 3 normalize/dedupe + empty-run guard (Gemini + publish in later phases)",
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
        "Fetch each enabled RSS/HTML source via helpers.httpRequest (isolated). Caps maxArticlesPerSource. Avoids fan-out pairedItem mis-labeling.",
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
    {
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
              id: "c0a1b2c3-d4e5-6789-abcd-ef0123456789",
              leftValue: "={{ $json.guard.proceed }}",
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
      id: IDS.ifArticles,
      name: "IF Articles Exist",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1420, 400],
      notes:
        "True → continue to AI (Phase 4). False → empty-run guard (no LLM, no publish overwrite).",
    },
    {
      parameters: {},
      id: IDS.done,
      name: "Done (Phase 3 stub)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1680, 280],
      notes:
        "Non-empty corpus ready. Phase 4 replaces this with Gemini categorize + summarize.",
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
        [{ node: "Done (Phase 3 stub)", type: "main", index: 0 }],
        [{ node: "Empty Run Guard", type: "main", index: 0 }],
      ],
    },
    "Empty Run Guard": {
      main: [[{ node: "End Empty Run", type: "main", index: 0 }]],
    },
  },
};

fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, outPath)}`);
console.log(
  `phase=${workflow.meta.phase} active=${workflow.active} cron=0 * * * * tz=${workflow.settings.timezone}`
);
console.log(
  `sources=${runtimeConfig.sources.length} publishUrl=${runtimeConfig.website.publishUrl}`
);
