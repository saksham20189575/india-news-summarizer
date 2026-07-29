import Ajv2020 from "ajv/dist/2020";
import schema from "../../contracts/briefing.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateBriefing = ajv.compile(schema);

export function validateBriefingPayload(briefing: unknown) {
  const ok = validateBriefing(briefing);
  return {
    ok: Boolean(ok),
    errors: ok ? [] : validateBriefing.errors || [],
  };
}
