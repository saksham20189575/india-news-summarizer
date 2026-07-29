#!/usr/bin/env node
/**
 * Generates workflows/india-news-summarizer.json for Phase 2
 * (skeleton + news collection) from config/sources.json.
 *
 * DEPRECATED for day-to-day use: prefer generate-phase3-workflow.js
 * (Phase 3 includes collection + normalize/dedupe + empty-run guard).
 *
 * Usage: node workflows/scripts/generate-phase2-workflow.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "../..");
const sourcesPath = path.join(root, "config/sources.json");
const inlinePath = path.join(root, "lib/collection/n8nInline.js");
const outPath = path.join(root, "workflows/india-news-summarizer.json");

const IDS = {
  manual: "e52e1e13-c24f-4f58-91e4-72d2fb35aed1",
  schedule: "3b11ee40-d970-46a5-a02b-76f760751d3c",
  setManual: "6d610e98-51d4-4513-a344-63a1e28ab9d1",
  setScheduled: "63098cad-5dd7-43ea-a95b-5d16af516e69",
  runContext: "c0708205-ceac-49b4-b4ec-22b06445917b",
  loadConfig: "150c6749-521f-449b-8206-754ff8c1326a",
  prepareSources: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  fetchFeed: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  extractArticles: "c3d4e5f6-a7b8-9012-cdef-123456789012",
  mergeCollection: "d4e5f6a7-b8c9-0123-def0-234567890123",
  done: "fba28478-03e7-4854-a7cb-56390aaddfdf",
};

const shared = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const n8nInline = fs
  .readFileSync(inlinePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/, ""); // drop file header comment

const publishBase =
  process.env.WEBSITE_PUBLISH_BASE_URL || "http://localhost:4000";

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
// Re-run: node workflows/scripts/generate-phase2-workflow.js
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
      phase: 'phase2-collection',
      nextPhaseHint: 'Phase 3 will normalize, dedupe, and guard empty runs',
    },
  },
];
`;

const prepareSourcesJs = `// Phase 2 — Fan out enabled sources (one item per source)
const ctx = $input.first().json;
const config = ctx.config || {};
const sources = (config.sources || []).filter((s) => s.enabled);

if (sources.length === 0) {
  return [
    {
      json: {
        run: {
          runId: ctx.runId,
          runDate: ctx.runDate,
          triggeredAt: ctx.triggeredAt,
          mode: ctx.mode,
          timezone: ctx.timezone,
        },
        config,
        source: null,
        fetchUrl: null,
        maxArticlesPerSource: config.maxArticlesPerSource || 8,
        skip: true,
        skipReason: 'No enabled sources',
      },
    },
  ];
}

return sources.map((source) => ({
  json: {
    run: {
      runId: ctx.runId,
      runDate: ctx.runDate,
      triggeredAt: ctx.triggeredAt,
      mode: ctx.mode,
      timezone: ctx.timezone,
    },
    config,
    source,
    fetchUrl: source.rssUrl || source.url,
    maxArticlesPerSource: config.maxArticlesPerSource || 8,
    skip: false,
  },
}));
`;

const extractArticlesJs = `// Phase 2 — Extract Article[] + SourceStatus from HTTP response
${n8nInline}

const prepared = $('Prepare Sources').item.json;
const http = $input.first().json || {};

const source = prepared.source;
const maxArticlesPerSource = prepared.maxArticlesPerSource || 8;
const fetchedAt = new Date().toISOString();

if (!source || prepared.skip) {
  return [
    {
      json: {
        run: prepared.run,
        config: prepared.config,
        articles: [],
        sourceStatus: {
          sourceId: 'none',
          sourceName: 'none',
          fetchMode: 'none',
          fetchUrl: null,
          statusCode: null,
          status: 'failed',
          error: prepared.skipReason || 'No source',
          articleCount: 0,
        },
      },
    },
  ];
}

// n8n HTTP Request shapes vary by version / options
const statusCode =
  http.statusCode ??
  http.status ??
  (http.error ? null : 200);

const body =
  typeof http.data === 'string'
    ? http.data
    : typeof http.body === 'string'
      ? http.body
      : typeof http === 'string'
        ? http
        : http.data != null
          ? String(http.data)
          : '';

const error =
  http.error ||
  (http.message && statusCode == null ? http.message : null) ||
  null;

const { articles, sourceStatus } = extractArticlesFromFetch(source, {
  body,
  statusCode,
  error,
  maxArticlesPerSource,
  fetchedAt,
});

return [
  {
    json: {
      run: prepared.run,
      config: prepared.config,
      articles,
      sourceStatus,
    },
  },
];
`;

const mergeCollectionJs = `// Phase 2 — Merge all source outputs into one Article[] + sourceStatuses[]
const items = $input.all();

const first = items[0] ? items[0].json : {};
const run = first.run || {};
const config = first.config || {};

const articles = [];
const sourceStatuses = [];

for (const item of items) {
  const j = item.json || {};
  if (Array.isArray(j.articles)) articles.push(...j.articles);
  if (j.sourceStatus) sourceStatuses.push(j.sourceStatus);
}

const sourcesConfigured = (config.sources || []).length;
const sourcesEnabled = (config.sources || []).filter((s) => s.enabled).length;
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
      ...run,
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
      },
      phase: 'phase2-collection',
      nextPhaseHint: 'Phase 3 will normalize, dedupe, and guard empty runs',
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
    "Phase 2: Manual + Schedule → Run Context → Config → fan-out sources → fetch RSS/HTML → extract Articles → merge. Keep inactive until Phase 8. TZ Asia/Kolkata. Disable concurrent executions in settings.",
  settings: {
    executionOrder: "v1",
    timezone: "Asia/Kolkata",
    saveManualExecutions: true,
    callerPolicy: "workflowsFromSameOwner",
    executionTimeout: 3300,
  },
  meta: {
    templateCredsSetupCompleted: true,
    phase: 2,
    description:
      "Hourly India news summarizer — Phase 2 news collection (Gemini + website publish in later phases)",
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
      parameters: { jsCode: prepareSourcesJs },
      id: IDS.prepareSources,
      name: "Prepare Sources",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [920, 400],
      notes: "Fan-out: one item per enabled source (RSS preferred).",
    },
    {
      parameters: {
        method: "GET",
        url: "={{ $json.fetchUrl }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "User-Agent",
              value:
                "Mozilla/5.0 (compatible; IndiaNewsSummarizer/0.2; +n8n)",
            },
            {
              name: "Accept",
              value:
                "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
            },
          ],
        },
        options: {
          timeout: 20000,
          redirect: {
            redirect: {},
          },
          response: {
            response: {
              fullResponse: true,
              responseFormat: "text",
            },
          },
        },
      },
      id: IDS.fetchFeed,
      name: "Fetch Source Feed",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1160, 400],
      continueOnFail: true,
      notes:
        "RSS when rssUrl set; else HTML. continueOnFail isolates per-source failures.",
      onError: "continueRegularOutput",
    },
    {
      parameters: { jsCode: extractArticlesJs },
      id: IDS.extractArticles,
      name: "Extract Articles",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1400, 400],
      notes:
        "Parse RSS/HTML → canonical Article[]; enforce maxArticlesPerSource; emit SourceStatus.",
    },
    {
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: mergeCollectionJs,
      },
      id: IDS.mergeCollection,
      name: "Merge Collection",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1640, 400],
      notes: "Combine articles[] + sourceStatuses[] for Phase 3.",
    },
    {
      parameters: {},
      id: IDS.done,
      name: "Done (Phase 2 stub)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1880, 400],
      notes:
        "Temporary stub. Phase 3 replaces this with normalize / dedupe / empty-run guard.",
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
      main: [[{ node: "Prepare Sources", type: "main", index: 0 }]],
    },
    "Prepare Sources": {
      main: [[{ node: "Fetch Source Feed", type: "main", index: 0 }]],
    },
    "Fetch Source Feed": {
      main: [[{ node: "Extract Articles", type: "main", index: 0 }]],
    },
    "Extract Articles": {
      main: [[{ node: "Merge Collection", type: "main", index: 0 }]],
    },
    "Merge Collection": {
      main: [[{ node: "Done (Phase 2 stub)", type: "main", index: 0 }]],
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
