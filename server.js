require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

//  Database 
// To swap the database, change this single require line.
// e.g. const db = require("./db/postgres");
const { initDB } = require("./db/sqlite");

//  Routes 
const chatRoutes     = require("./routes/chat");
const settingsRoutes = require("./routes/settings");

//  App Setup 
const app  = express();
const PORT = process.env.PORT || 3000;

//  Middleware 
app.use(cors());
app.use(express.json());

// Serve everything in /public as static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

//  API Routes 
app.use("/api/conversations", chatRoutes);
app.use("/api/settings",      settingsRoutes);

//  Catch-all: serve index.html for any unknown route 
// Keeps things working if the user refreshes on a deep URL
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

//  Global Error Handler 
app.use((err, req, res, next) => {
  console.error("[Error]", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

//  Boot 
function start() {
  try {
    // Initialize the database schema before accepting any requests
    initDB();
    console.log("[DB] Database initialized successfully");

    app.listen(PORT, () => {
      console.log(`[Server] Running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("[Fatal] Failed to start server:", err);
    process.exit(1);
  }
}

start();