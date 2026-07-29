function requirePublishAuth(req, res, next) {
  const expected = process.env.PUBLISH_API_KEY;
  if (!expected || expected === "change-me-generate-with-openssl-rand-hex-32") {
    return res.status(500).json({
      error: "PUBLISH_API_KEY is not configured on the API server",
    });
  }

  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

module.exports = { requirePublishAuth };
