/**
 * Extract and parse JSON objects from LLM text (tolerates markdown fences).
 */

function stripFences(text) {
  let s = String(text || "").trim();
  if (!s) return "";
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  return s;
}

function extractJsonObject(text) {
  const s = stripFences(text);
  if (!s) {
    const err = new Error("empty_llm_text");
    err.code = "empty_llm_text";
    throw err;
  }
  try {
    return JSON.parse(s);
  } catch (_) {
    // fall through to brace slice
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const err = new Error("no_json_object");
    err.code = "no_json_object";
    throw err;
  }
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    const err = new Error(`json_parse_failed: ${e.message}`);
    err.code = "json_parse_failed";
    throw err;
  }
}

module.exports = { stripFences, extractJsonObject };
