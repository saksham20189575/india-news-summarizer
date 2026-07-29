const express = require("express");
const { requirePublishAuth } = require("../auth");
const { readLatest, writeLatestAtomic, validate } = require("../store");

const router = express.Router();

router.get("/summary", (_req, res) => {
  try {
    const latest = readLatest();
    if (!latest) {
      return res.status(404).json({
        error: "No summary published yet",
      });
    }
    return res.json(latest);
  } catch (err) {
    console.error("Failed to read latest summary", err);
    return res.status(500).json({ error: "Failed to read summary" });
  }
});

router.put("/summary", requirePublishAuth, (req, res) => {
  const briefing = req.body;
  const { ok, errors } = validate(briefing);
  if (!ok) {
    return res.status(400).json({
      error: "Invalid briefing payload",
      details: errors,
    });
  }

  try {
    writeLatestAtomic(briefing);
    return res.status(200).json({
      ok: true,
      runId: briefing.runId,
      generatedAt: briefing.generatedAt,
    });
  } catch (err) {
    console.error("Failed to write latest summary", err);
    return res.status(500).json({ error: "Failed to persist summary" });
  }
});

module.exports = router;
