const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_PATH = path.join(__dirname, "../../contracts/briefing.schema.json");
const DATA_PATH = path.join(__dirname, "../data/latest-summary.json");
const TMP_PATH = path.join(__dirname, "../data/latest-summary.json.tmp");

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateBriefing = ajv.compile(schema);

function readLatest() {
  if (!fs.existsSync(DATA_PATH)) {
    return null;
  }
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  return JSON.parse(raw);
}

function writeLatestAtomic(briefing) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(TMP_PATH, JSON.stringify(briefing, null, 2), "utf8");
  fs.renameSync(TMP_PATH, DATA_PATH);
}

function validate(briefing) {
  const ok = validateBriefing(briefing);
  return {
    ok,
    errors: ok ? [] : validateBriefing.errors || [],
  };
}

module.exports = {
  DATA_PATH,
  readLatest,
  writeLatestAtomic,
  validate,
};
