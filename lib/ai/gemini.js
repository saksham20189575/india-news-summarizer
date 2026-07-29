/**
 * Gemini generateContent client (REST).
 * Default model: gemini-3.5-flash-lite
 * Local: GEMINI_API_KEY env. n8n: pass apiKey from $vars.GEMINI_API_KEY.
 */

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

async function defaultFetch(url, options) {
  if (typeof fetch === "function") {
    return fetch(url, options);
  }
  const https = require("https");
  const { URL } = require("url");
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            async text() {
              return body;
            },
            async json() {
              return JSON.parse(body);
            },
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractTextFromGeminiResponse(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts;
  if (!Array.isArray(parts) || !parts.length) {
    const err = new Error("gemini_empty_candidates");
    err.code = "gemini_empty_candidates";
    err.raw = data;
    throw err;
  }
  // Prefer non-thought text parts when thinking models emit both
  const texts = parts
    .filter((p) => p && p.text && !p.thought)
    .map((p) => p.text);
  const joined = (texts.length ? texts : parts.map((p) => p.text || ""))
    .join("")
    .trim();
  return joined;
}

function usageFromResponse(data) {
  const u = data && data.usageMetadata;
  if (!u) return null;
  return {
    promptTokenCount: u.promptTokenCount || 0,
    candidatesTokenCount: u.candidatesTokenCount || 0,
    totalTokenCount: u.totalTokenCount || 0,
  };
}

function buildGenerationConfig(opts = {}) {
  const thinkingLevel = opts.thinkingLevel || "minimal";
  const config = {
    responseMimeType: "application/json",
    // Gemini 3.x: prefer thinkingLevel; keep budget 0 as extra throttle for lite
    thinkingConfig: {
      thinkingLevel: String(thinkingLevel).toLowerCase(),
    },
  };
  // temperature is deprecated on some 3.x models — only send if explicitly set
  if (typeof opts.temperature === "number" && opts.includeTemperature) {
    config.temperature = opts.temperature;
  }
  return config;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model]
 * @param {string} [opts.thinkingLevel]
 * @param {number} [opts.temperature]
 * @param {boolean} [opts.includeTemperature]
 * @param {function} [opts.fetchImpl]
 * @param {function} [opts.httpRequest]
 * @returns {Promise<{ text: string, usage: object|null, raw: object }>}
 */
async function generateContent(opts = {}) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    const err = new Error("missing_gemini_api_key");
    err.code = "missing_gemini_api_key";
    throw err;
  }

  const model = opts.model || DEFAULT_MODEL;
  const url = `${DEFAULT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: buildGenerationConfig(opts),
  };

  if (typeof opts.httpRequest === "function") {
    const res = await opts.httpRequest({
      method: "POST",
      url,
      headers: { "Content-Type": "application/json" },
      body,
      json: true,
      timeout: opts.timeout || 60000,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
    });
    const statusCode = res.statusCode ?? res.status ?? 0;
    let data = res.body ?? res.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_) {
        /* keep string */
      }
    }
    if (statusCode < 200 || statusCode >= 300) {
      const err = new Error(
        `gemini_http_${statusCode}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`
      );
      err.code = "gemini_http_error";
      err.statusCode = statusCode;
      throw err;
    }
    return {
      text: extractTextFromGeminiResponse(data),
      usage: usageFromResponse(data),
      raw: data,
    };
  }

  const fetchImpl = opts.fetchImpl || defaultFetch;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const textBody = await res.text();
  let data;
  try {
    data = JSON.parse(textBody);
  } catch (_) {
    data = { raw: textBody };
  }
  if (!res.ok) {
    const err = new Error(
      `gemini_http_${res.status}: ${textBody.slice(0, 200)}`
    );
    err.code = "gemini_http_error";
    err.statusCode = res.status;
    throw err;
  }
  return {
    text: extractTextFromGeminiResponse(data),
    usage: usageFromResponse(data),
    raw: data,
  };
}

module.exports = {
  DEFAULT_MODEL,
  generateContent,
  extractTextFromGeminiResponse,
  usageFromResponse,
  buildGenerationConfig,
};
