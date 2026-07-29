require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { writeLatestAtomic, validate } = require("../src/store");

const fixturePath = path.join(__dirname, "../../fixtures/briefing_valid.json");
const briefing = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const { ok, errors } = validate(briefing);

if (!ok) {
  console.error("Fixture failed schema validation", errors);
  process.exit(1);
}

writeLatestAtomic(briefing);
console.log("Seeded api/data/latest-summary.json from fixtures/briefing_valid.json");
