const express = require("express");
const router  = express.Router();

//  Database 
const { getAllSettings, setSettings } = require("../db/sqlite");

//  GET /api/settings 
// Returns all global settings as a flat key/value object
// e.g. { endpoint: "...", api_key: "...", model: "...", system_prompt: "..." }
router.get("/", (req, res, next) => {
  try {
    const settings = getAllSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

//  POST /api/settings 
// Upserts one or more settings.
// Body: { endpoint?, api_key?, model?, system_prompt?, ...any custom key }
router.post("/", (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Request body must be a JSON object" });
    }

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "No settings provided" });
    }

    setSettings(req.body);

    // Return the full updated settings object
    const updated = getAllSettings();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;