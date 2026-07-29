require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");

const fixturePath = path.join(__dirname, "../../fixtures/briefing_valid.json");
const dataPath = path.join(__dirname, "../data/latest-summary.json");
const tmpPath = path.join(__dirname, "../data/latest-summary.json.tmp");
const briefing = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

async function seedViaHttp(base, key) {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/summary`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(briefing),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT /api/summary failed (${res.status}): ${text}`);
  }
}

async function seedViaFile() {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(briefing, null, 2), "utf8");
  fs.renameSync(tmpPath, dataPath);
  console.log(`Seeded ${dataPath} from fixtures/briefing_valid.json`);
}

async function main() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const key = process.env.PUBLISH_API_KEY;
    if (!key || key === "change-me-generate-with-openssl-rand-hex-32") {
      throw new Error("Set PUBLISH_API_KEY in web/.env.local to seed via Blob storage");
    }

    const base =
      process.env.API_BASE ||
      `http://127.0.0.1:${process.env.PORT || 3000}`;
    await seedViaHttp(base, key);
    console.log("Seeded Vercel Blob latest-summary.json via PUT /api/summary");
    console.log("(Next.js dev server must be running for Blob seed)");
    return;
  }

  await seedViaFile();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
