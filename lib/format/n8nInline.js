/**
 * Self-contained Phase 6 format helpers for n8n Code nodes.
 * Keep in sync with lib/format/briefing.js — embedded by generate-phase4-workflow.js.
 */

const FORMAT_DEFAULT_TITLE = "India News Summary";

function formatToAsiaKolkataIso(input) {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .filter(function (p) {
        return p.type !== "literal";
      })
      .map(function (p) {
        return [p.type, p.value];
      })
  );

  return (
    parts.year +
    "-" +
    parts.month +
    "-" +
    parts.day +
    "T" +
    parts.hour +
    ":" +
    parts.minute +
    ":" +
    parts.second +
    "+05:30"
  );
}

function formatMapFailedSources(input) {
  const collection = input.collection || {};
  const corpus = input.corpus || {};
  const raw =
    collection.failedSources ||
    corpus.failedSources ||
    (Array.isArray(input.sourceStatuses)
      ? input.sourceStatuses
          .filter(function (s) {
            return s.status === "failed";
          })
          .map(function (s) {
            return {
              sourceId: s.sourceId,
              sourceName: s.sourceName,
              error: s.error,
            };
          })
      : []);

  return raw.map(function (entry) {
    return {
      id: entry.id || entry.sourceId || "unknown",
      name: entry.name || entry.sourceName || "Unknown source",
      error: entry.error || "unknown",
    };
  });
}

function formatSanitizeCategories(categories) {
  return (categories || [])
    .map(function (cat) {
      return {
        category: cat.category,
        bullets: (cat.bullets || [])
          .map(function (bullet) {
            return {
              summary: String(bullet.summary || "").trim(),
              sources: (bullet.sources || [])
                .map(function (source) {
                  return {
                    title: String(source.title || "").trim(),
                    url: String(source.url || "").trim(),
                  };
                })
                .filter(function (source) {
                  return (
                    source.title && /^https?:\/\//i.test(source.url)
                  );
                }),
            };
          })
          .filter(function (bullet) {
            return bullet.summary && bullet.sources.length > 0;
          }),
      };
    })
    .filter(function (cat) {
      return cat.bullets.length > 0;
    });
}

function formatResolveGeneratedAt(input, now) {
  const candidates = [input.triggeredAt, input.generatedAt, now || new Date()];
  for (let i = 0; i < candidates.length; i++) {
    const formatted = formatToAsiaKolkataIso(candidates[i]);
    if (formatted) return formatted;
  }
  return formatToAsiaKolkataIso(now || new Date());
}

function formatBuildBriefing(input, options) {
  options = options || {};
  const config = input.config || {};
  const collection = input.collection || {};
  const corpus = input.corpus || {};
  const categories = formatSanitizeCategories(input.categories);
  const sourcesConfigured =
    collection.sourcesConfigured != null
      ? collection.sourcesConfigured
      : Array.isArray(config.sources)
        ? config.sources.length
        : 0;
  const sourcesSucceeded =
    collection.sourcesSucceeded != null
      ? collection.sourcesSucceeded
      : corpus.sourceSuccessCount != null
        ? corpus.sourceSuccessCount
        : 0;
  const articleCount =
    corpus.articleCount != null
      ? corpus.articleCount
      : collection.articleCount != null
        ? collection.articleCount
        : input.articleCount != null
          ? input.articleCount
          : 0;

  const briefing = {
    schemaVersion: 1,
    runId: input.runId,
    generatedAt: formatResolveGeneratedAt(input, options.now),
    timezone: input.timezone || config.timezone || "Asia/Kolkata",
    title: options.title || FORMAT_DEFAULT_TITLE,
    status: "ok",
    meta: {
      sourcesConfigured: sourcesConfigured,
      sourcesSucceeded: sourcesSucceeded,
      articleCount: articleCount,
      failedSources: formatMapFailedSources(input),
    },
    categories: categories,
  };

  const proceed =
    briefing.status === "ok" &&
    briefing.categories.length > 0 &&
    Boolean(briefing.runId);

  return {
    briefing: briefing,
    guard: {
      proceed: proceed,
      reason: proceed ? null : "no_publishable_categories",
      skipPublish: !proceed,
    },
  };
}
