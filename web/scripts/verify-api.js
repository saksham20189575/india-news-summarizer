/**
 * API exit-criteria checks for the merged Next.js API routes.
 * Local (Next.js on PORT):  npm run dev  then  npm run verify
 * Production smoke-test:    API_BASE=https://your-app.vercel.app node scripts/verify-api.js
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

const base = (
  process.env.API_BASE ||
  `http://127.0.0.1:${process.env.PORT || 3000}`
).replace(/\/$/, "");
const key = process.env.PUBLISH_API_KEY;
const fixturePath = path.join(__dirname, "../../fixtures/briefing_valid.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

async function request(method, urlPath, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  if (!key || key === "change-me-generate-with-openssl-rand-hex-32") {
    throw new Error("Set a real PUBLISH_API_KEY in web/.env.local before verifying");
  }

  const health = await request("GET", "/health");
  assert(health.status === 200 && health.json?.ok, "GET /health failed");

  const unauthorized = await request("PUT", "/api/summary", {
    headers: { "Content-Type": "application/json" },
    body: fixture,
  });
  assert(unauthorized.status === 401, `Expected 401 without key, got ${unauthorized.status}`);

  const badToken = await request("PUT", "/api/summary", {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer wrong-key",
    },
    body: fixture,
  });
  assert(badToken.status === 401, `Expected 401 with bad key, got ${badToken.status}`);

  const putOk = await request("PUT", "/api/summary", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: fixture,
  });
  assert(putOk.status === 200 && putOk.json?.ok === true, `Authorized PUT failed: ${putOk.status}`);

  const getBeforeInvalid = await request("GET", "/api/summary");
  assert(getBeforeInvalid.status === 200, "GET /api/summary failed before invalid PUT");
  assert(getBeforeInvalid.json?.runId === fixture.runId, "Stored runId mismatch after PUT");

  const invalid = {
    ...fixture,
    schemaVersion: 2,
    categories: [],
  };
  const putInvalid = await request("PUT", "/api/summary", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: invalid,
  });
  assert(putInvalid.status === 400, `Expected 400 for invalid body, got ${putInvalid.status}`);

  const getAfterInvalid = await request("GET", "/api/summary");
  assert(getAfterInvalid.status === 200, "GET /api/summary failed after invalid PUT");
  assert(
    getAfterInvalid.json?.runId === getBeforeInvalid.json?.runId &&
      getAfterInvalid.json?.generatedAt === getBeforeInvalid.json?.generatedAt,
    "Invalid PUT wiped previous good summary"
  );

  assert(getAfterInvalid.json?.schemaVersion === 1, "GET payload missing schemaVersion 1");
  assert(
    Array.isArray(getAfterInvalid.json?.categories) &&
      getAfterInvalid.json.categories.length > 0,
    "GET categories empty"
  );
  assert(getAfterInvalid.json?.runId === fixture.runId, "GET runId mismatch");

  console.log("Next.js API verification passed:");
  console.log("  - unauthorized PUT rejected (401)");
  console.log("  - valid PUT stores fixture");
  console.log("  - GET returns stored fixture");
  console.log("  - invalid PUT leaves previous latest intact");
}

main().catch((err) => {
  console.error("Next.js API verification failed:", err.message);
  process.exit(1);
});
