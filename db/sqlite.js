const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

//  Connection

const DB_PATH = process.env.DB_PATH || "./data/chat.db";

// Ensure the data directory exists before opening the database file
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

//  Schema

/**
 * Creates all required tables if they do not already exist.
 * Call this once at app startup.
 */
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL DEFAULT 'New Conversation',
      model       TEXT    NOT NULL DEFAULT '',
      system_prompt TEXT  NOT NULL DEFAULT '',
      endpoint    TEXT    NOT NULL DEFAULT '',
      api_key     TEXT    NOT NULL DEFAULT '',
      stream      TEXT    NOT NULL DEFAULT 'false',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content         TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrate existing databases that pre-date the stream column
  const cols = db.pragma("table_info(conversations)").map((c) => c.name);
  if (!cols.includes("stream")) {
    db.exec(
      `ALTER TABLE conversations ADD COLUMN stream TEXT NOT NULL DEFAULT 'false'`,
    );
  }
}

//  Conversations

/**
 * Returns all conversations ordered by most recently updated.
 * @returns {Array<Object>}
 */
function getAllConversations() {
  return db
    .prepare(`SELECT * FROM conversations ORDER BY updated_at DESC`)
    .all();
}

/**
 * Returns a single conversation by ID.
 * @param {number} id
 * @returns {Object|undefined}
 */
function getConversationById(id) {
  return db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id);
}

/**
 * Creates a new conversation and returns the created row.
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.model
 * @param {string} params.system_prompt
 * @param {string} params.endpoint
 * @param {string} params.api_key
 * @param {string} [params.stream]
 * @returns {Object}
 */
function createConversation({
  title,
  model,
  system_prompt,
  endpoint,
  api_key,
  stream = "false",
}) {
  const stmt = db.prepare(`
    INSERT INTO conversations (title, model, system_prompt, endpoint, api_key, stream)
    VALUES (@title, @model, @system_prompt, @endpoint, @api_key, @stream)
  `);

  const result = stmt.run({
    title,
    model,
    system_prompt,
    endpoint,
    api_key,
    stream,
  });
  return getConversationById(result.lastInsertRowid);
}

/**
 * Updates an existing conversation's metadata and bumps updated_at.
 * @param {number} id
 * @param {Object} params
 * @param {string} [params.title]
 * @param {string} [params.model]
 * @param {string} [params.system_prompt]
 * @param {string} [params.endpoint]
 * @param {string} [params.api_key]
 * @param {string} [params.stream]
 * @returns {Object|undefined}
 */
function updateConversation(
  id,
  { title, model, system_prompt, endpoint, api_key, stream },
) {
  db.prepare(
    `
    UPDATE conversations
    SET title         = COALESCE(@title,         title),
        model         = COALESCE(@model,         model),
        system_prompt = COALESCE(@system_prompt, system_prompt),
        endpoint      = COALESCE(@endpoint,      endpoint),
        api_key       = COALESCE(@api_key,       api_key),
        stream        = COALESCE(@stream,        stream),
        updated_at    = datetime('now')
    WHERE id = @id
  `,
  ).run({ id, title, model, system_prompt, endpoint, api_key, stream });

  return getConversationById(id);
}

/**
 * Deletes a conversation and all its messages (CASCADE).
 * @param {number} id
 * @returns {boolean} true if a row was deleted
 */
function deleteConversation(id) {
  const result = db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  return result.changes > 0;
}

//  Messages

/**
 * Returns all messages for a conversation in chronological order.
 * @param {number} conversationId
 * @returns {Array<Object>}
 */
function getMessagesByConversationId(conversationId) {
  return db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
    .all(conversationId);
}

/**
 * Inserts a new message and returns the created row.
 * @param {Object} params
 * @param {number} params.conversation_id
 * @param {string} params.role  - 'user' | 'assistant' | 'system'
 * @param {string} params.content
 * @returns {Object}
 */
function createMessage({ conversation_id, role, content }) {
  const stmt = db.prepare(`
    INSERT INTO messages (conversation_id, role, content)
    VALUES (@conversation_id, @role, @content)
  `);

  const result = stmt.run({ conversation_id, role, content });

  // Bump the parent conversation's updated_at timestamp
  db.prepare(
    `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
  ).run(conversation_id);

  return db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(result.lastInsertRowid);
}

//  Settings

/**
 * Returns all settings as a plain key/value object.
 * @returns {Object}
 */
function getAllSettings() {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Upserts a single setting value.
 * @param {string} key
 * @param {string} value
 */
function setSetting(key, value) {
  db.prepare(
    `
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
  ).run(key, String(value));
}

/**
 * Upserts multiple settings at once from a plain object.
 * @param {Object} settingsObj  e.g. { endpoint: '...', api_key: '...' }
 */
function setSettings(settingsObj) {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  // Wrap in a transaction so all keys are written atomically
  const upsertMany = db.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      upsert.run(key, String(value));
    }
  });

  upsertMany(settingsObj);
}

//  Exports

module.exports = {
  initDB,
  // Conversations
  getAllConversations,
  getConversationById,
  createConversation,
  updateConversation,
  deleteConversation,
  // Messages
  getMessagesByConversationId,
  createMessage,
  // Settings
  getAllSettings,
  setSetting,
  setSettings,
};
