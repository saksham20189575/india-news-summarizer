/**
 * Client-side Gemini rate limiter for free-tier style quotas.
 * Defaults match Gemini 3.5 Flash Lite: 15 RPM, 250K TPM, 500 RPD.
 */

const DEFAULT_LIMITS = {
  requestsPerMinute: 15,
  tokensPerMinute: 250000,
  requestsPerDay: 500,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rough token estimate (~4 chars/token) plus output headroom. */
function estimateTokens(text, outputReserve) {
  const chars = String(text || "").length;
  const input = Math.ceil(chars / 4);
  const out = Math.max(64, Number(outputReserve) || 800);
  return input + out;
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // UTC day bucket
}

/**
 * @param {object} [limits]
 * @param {number} [limits.requestsPerMinute]
 * @param {number} [limits.tokensPerMinute]
 * @param {number} [limits.requestsPerDay]
 * @param {number} [limits.minRequestGapMs] - override computed gap
 * @param {number} [limits.maxRequestsPerRun] - hard cap for one pipeline run
 */
function createRateLimiter(limits = {}) {
  const rpm = Math.max(1, Number(limits.requestsPerMinute) || DEFAULT_LIMITS.requestsPerMinute);
  const tpm = Math.max(1000, Number(limits.tokensPerMinute) || DEFAULT_LIMITS.tokensPerMinute);
  const rpd = Math.max(1, Number(limits.requestsPerDay) || DEFAULT_LIMITS.requestsPerDay);
  // 60s/rpm + 200ms buffer so we stay under the ceiling
  const minGapMs =
    typeof limits.minRequestGapMs === "number"
      ? Math.max(0, limits.minRequestGapMs)
      : Math.ceil(60000 / rpm) + 200;
  const maxRequestsPerRun =
    typeof limits.maxRequestsPerRun === "number"
      ? Math.max(1, limits.maxRequestsPerRun)
      : Math.min(16, Math.floor(rpd / 24)); // hourly-safe default

  let lastRequestAt = 0;
  const minuteWindow = []; // { at, tokens }
  let day = dayKey();
  let dayCount = 0;
  let runCount = 0;

  function prune(now) {
    const cutoff = now - 60000;
    while (minuteWindow.length && minuteWindow[0].at < cutoff) {
      minuteWindow.shift();
    }
    const today = dayKey(new Date(now));
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
  }

  function minuteTotals(now) {
    prune(now);
    let tokens = 0;
    for (const e of minuteWindow) tokens += e.tokens;
    return { requests: minuteWindow.length, tokens };
  }

  /**
   * Wait until a request with estimatedTokens is allowed, then reserve it.
   * Throws rate_limit_day or rate_limit_run if hard caps exceeded.
   */
  async function acquire(estimatedTokens) {
    const tokens = Math.max(1, Number(estimatedTokens) || 1);
    const now0 = Date.now();
    prune(now0);

    if (runCount >= maxRequestsPerRun) {
      const err = new Error(
        `rate_limit_run: max ${maxRequestsPerRun} Gemini requests per run`
      );
      err.code = "rate_limit_run";
      throw err;
    }
    if (dayCount >= rpd) {
      const err = new Error(
        `rate_limit_day: max ${rpd} Gemini requests per day`
      );
      err.code = "rate_limit_day";
      throw err;
    }

    // Loop until RPM + TPM + gap satisfied
    for (;;) {
      const now = Date.now();
      prune(now);
      const { requests, tokens: usedTokens } = minuteTotals(now);

      let waitMs = 0;
      const sinceLast = now - lastRequestAt;
      if (lastRequestAt && sinceLast < minGapMs) {
        waitMs = Math.max(waitMs, minGapMs - sinceLast);
      }
      if (requests >= rpm) {
        const oldest = minuteWindow[0];
        waitMs = Math.max(waitMs, oldest.at + 60000 - now + 50);
      }
      if (usedTokens + tokens > tpm) {
        const oldest = minuteWindow[0];
        waitMs = Math.max(
          waitMs,
          oldest ? oldest.at + 60000 - now + 50 : minGapMs
        );
      }

      if (waitMs <= 0) break;
      await sleep(waitMs);
    }

    const at = Date.now();
    lastRequestAt = at;
    minuteWindow.push({ at, tokens });
    dayCount += 1;
    runCount += 1;

    return {
      waited: true,
      estimatedTokens: tokens,
      runCount,
      dayCount,
      minGapMs,
    };
  }

  function getStats() {
    const now = Date.now();
    const { requests, tokens } = minuteTotals(now);
    return {
      requestsPerMinuteLimit: rpm,
      tokensPerMinuteLimit: tpm,
      requestsPerDayLimit: rpd,
      minGapMs,
      maxRequestsPerRun,
      runCount,
      dayCount,
      day,
      minuteRequests: requests,
      minuteTokens: tokens,
    };
  }

  function remainingRunBudget() {
    return Math.max(0, maxRequestsPerRun - runCount);
  }

  return {
    acquire,
    getStats,
    remainingRunBudget,
    estimateTokens,
    minGapMs,
    maxRequestsPerRun,
    limits: { requestsPerMinute: rpm, tokensPerMinute: tpm, requestsPerDay: rpd },
  };
}

/** Backoff for HTTP 429 / transient errors (ms). */
function retryBackoffMs(attempt, statusCode) {
  if (statusCode === 429) {
    // Stay polite under RPM: ~1 full minute slot / rpm * attempt
    return Math.min(60000, (Math.ceil(60000 / 15) + 500) * (attempt + 1));
  }
  return Math.min(10000, 500 * Math.pow(2, attempt));
}

module.exports = {
  DEFAULT_LIMITS,
  createRateLimiter,
  estimateTokens,
  retryBackoffMs,
  sleep,
  dayKey,
};
