/**
 * Minimal unit checks for RSS parse + extract (no network).
 * Run: node lib/collection/selftest.js
 */
const assert = require("assert");
const { parseFeed } = require("./parseFeed");
const { extractArticlesFromFetch } = require("./extract");
const { hashArticleId, canonicalizeUrl } = require("./ids");

const sampleRss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>Test</title>
<item>
  <title><![CDATA[Sample India headline about policy change today]]></title>
  <link><![CDATA[ https://example.com/news/story-1?utm_source=rss ]]></link>
  <description><![CDATA[<p>Lead paragraph for the story.</p>]]></description>
  <pubDate>Sun, 26 Jul 2026 10:00:00 +0530</pubDate>
</item>
<item>
  <title>Second story with enough characters for validity</title>
  <link>https://example.com/news/story-2</link>
  <description>Another snippet</description>
  <pubDate>Sun, 26 Jul 2026 09:00:00 +0530</pubDate>
</item>
</channel></rss>`;

const items = parseFeed(sampleRss);
assert.strictEqual(items.length, 2);
assert.ok(items[0].title.includes("Sample India"));
assert.ok(items[0].url.includes("example.com"));

const source = {
  id: "test_source",
  name: "Test Source",
  url: "https://example.com/",
  rssUrl: "https://example.com/rss",
};

const { articles, sourceStatus } = extractArticlesFromFetch(source, {
  body: sampleRss,
  statusCode: 200,
  maxArticlesPerSource: 1,
  fetchedAt: "2026-07-26T11:00:00.000Z",
});

assert.strictEqual(sourceStatus.status, "success");
assert.strictEqual(articles.length, 1, "maxArticlesPerSource=1");
assert.ok(!articles[0].url.includes("utm_source"));
assert.strictEqual(
  articles[0].id,
  hashArticleId("test_source", canonicalizeUrl(articles[0].url))
);
assert.ok(articles[0].snippet.length > 0);
assert.ok(articles[0].publishedAt);

const failed = extractArticlesFromFetch(source, {
  body: "",
  statusCode: null,
  error: "Timeout after 20000ms",
  maxArticlesPerSource: 8,
});
assert.strictEqual(failed.sourceStatus.status, "failed");
assert.strictEqual(failed.articles.length, 0);

console.log("selftest OK");
