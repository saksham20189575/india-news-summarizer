#!/usr/bin/env node
/**
 * Generates workflows/india-news-summarizer.json from config/sources.json
 * so Phase 1 config stays in sync with the repo source of truth.
 *
 * DEPRECATED for day-to-day use: prefer generate-phase2-workflow.js
 * (Phase 2 includes the Phase 1 skeleton plus collection).
 *
 * Usage: node workflows/scripts/generate-phase1-workflow.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "../..");
const sourcesPath = path.join(root, "config/sources.json");
const outPath = path.join(root, "workflows/india-news-summarizer.json");

const IDS = {
  manual: "e52e1e13-c24f-4f58-91e4-72d2fb35aed1",
  schedule: "3b11ee40-d970-46a5-a02b-76f760751d3c",
  setManual: "6d610e98-51d4-4513-a344-63a1e28ab9d1",
  setScheduled: "63098cad-5dd7-43ea-a95b-5d16af516e69",
  runContext: "c0708205-ceac-49b4-b4ec-22b06445917b",
  loadConfig: "150c6749-521f-449b-8206-754ff8c1326a",
  done: "fba28478-03e7-4854-a7cb-56390aaddfdf",
};

const shared = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));

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
  // Prefer crypto.randomUUID in n8n (modern Node); fallback for older runtimes.
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
// Re-run: node workflows/scripts/generate-phase1-workflow.js
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
      phase: 'phase1-skeleton',
      nextPhaseHint: 'Phase 2 will fan out config.sources and collect articles',
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
    "Phase 1 skeleton: Manual + hourly Schedule → Run Context → Config → Done stub. Keep inactive until Phase 8. Timezone Asia/Kolkata. Disable concurrent executions in workflow settings.",
  settings: {
    executionOrder: "v1",
    timezone: "Asia/Kolkata",
    saveManualExecutions: true,
    callerPolicy: "workflowsFromSameOwner",
    executionTimeout: 3300,
  },
  meta: {
    templateCredsSetupCompleted: true,
    phase: 1,
    description:
      "Hourly India news summarizer skeleton (Gemini + website publish in later phases)",
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
      position: [0, 200],
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
      position: [0, 420],
      notes:
        "Every hour at minute 0. Uses workflow timezone Asia/Kolkata. Keep workflow inactive until Phase 8.",
    },
    setModeNode(IDS.setManual, "Set Mode Manual", "manual", [260, 200]),
    setModeNode(
      IDS.setScheduled,
      "Set Mode Scheduled",
      "scheduled",
      [260, 420]
    ),
    {
      parameters: {
        jsCode: runContextJs,
      },
      id: IDS.runContext,
      name: "Build Run Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [520, 300],
    },
    {
      parameters: {
        jsCode: loadConfigJs,
      },
      id: IDS.loadConfig,
      name: "Load Config",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [780, 300],
    },
    {
      parameters: {},
      id: IDS.done,
      name: "Done (Phase 1 stub)",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1040, 300],
      notes:
        "Temporary stub. Phase 2 replaces this with source fan-out + collection.",
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
      main: [[{ node: "Done (Phase 1 stub)", type: "main", index: 0 }]],
    },
  },
};

fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, outPath)}`);
console.log(`active=${workflow.active} cron=0 * * * * tz=${workflow.settings.timezone}`);
console.log(`sources=${runtimeConfig.sources.length} publishUrl=${runtimeConfig.website.publishUrl}`);
