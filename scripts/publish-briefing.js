#!/usr/bin/env node
/**
 * Phase 6 local publish — PUT canonical briefing to the API.
 *
 * Usage:
 *   node scripts/publish-briefing.js --in fixtures/briefing_valid.json
 *   API_BASE=http://localhost:4000 PUBLISH_API_KEY=... node scripts/publish-briefing.js --in fixtures/briefing_valid.json
 */
require("dotenv").config({ path: require("path").join(__dirname, "../api/.env") });

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const inIdx = args.indexOf("--in");
const inPath =
  inIdx >= 0 ? args[inIdx + 1] : "fixtures/briefing_valid.json";
const base = (process.env.API_BASE || "http://127.0.0.1:4000").replace(
  /\/$/,
  ""
);
const key = process.env.PUBLISH_API_KEY;

async function main() {
  if (!key) {
    throw new Error("Set PUBLISH_API_KEY (api/.env or env)");
  }

  const absIn = path.isAbsolute(inPath) ? inPath : path.join(root, inPath);
  const briefing = JSON.parse(fs.readFileSync(absIn, "utf8"));

  const res = await fetch(`${base}/api/summary`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(briefing),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`Publish failed: HTTP ${res.status}`);
  }

  console.log(JSON.stringify(json, null, 2));
  console.error(`OK: published runId=${briefing.runId} to ${base}/api/summary`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
