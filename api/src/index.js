require("dotenv").config();

const express = require("express");
const cors = require("cors");
const summaryRouter = require("./routes/summary");

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "PUT", "OPTIONS"],
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "india-news-api",
    timezoneHint: "Asia/Kolkata",
  });
});

app.use("/api", summaryRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`India news API listening on http://localhost:${port}`);
});
