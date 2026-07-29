#!/usr/bin/env node
/**
 * Phase 6 local formatter — build canonical briefing JSON from AI output.
 *
 * Usage:
 *   node scripts/format-briefing.js --in fixtures/ai/briefing_intermediate.json
 *   node scripts/format-briefing.js --in fixtures/ai/briefing_intermediate.json --out fixtures/briefing_formatted.json
 */
const fs = require("fs");
const path = require("path");
const { formatBriefing } = require("../lib/format");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const inIdx = args.indexOf("--in");
const outIdx = args.indexOf("--out");
const inPath =
  inIdx >= 0 ? args[inIdx + 1] : "fixtures/ai/briefing_intermediate.json";
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

const absIn = path.isAbsolute(inPath) ? inPath : path.join(root, inPath);
const input = JSON.parse(fs.readFileSync(absIn, "utf8"));
const result = formatBriefing(input);

console.log(
  JSON.stringify(
    {
      guard: result.guard,
      categoryCount: result.briefing.categories.length,
      generatedAt: result.briefing.generatedAt,
      meta: result.briefing.meta,
    },
    null,
    2
  )
);

if (outPath) {
  const absOut = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, JSON.stringify(result.briefing, null, 2) + "\n");
  console.error(`Wrote ${path.relative(root, absOut)}`);
}

if (!result.guard.proceed) {
  console.error("FAIL: no publishable briefing");
  process.exit(1);
}

console.error(
  `OK: formatted ${result.briefing.categories.length} categories for publish`
);
