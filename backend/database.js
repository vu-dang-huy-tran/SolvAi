/**
 * database.js — SQLite-Persistenz (better-sqlite3).
 *
 * Verwaltet alle dauerhaften Daten:
 * - Threads + Kommentare + Lösungen (JSON-Blob pro Thread)
 * - Bot-Konfigurationen (25 Seed-Bots + Custom-Bots)
 * - Bot-Memory (recherchiertes Wissen)
 * - Settings (Key-Value Store)
 * - Thread-Migration von legacy threads.json
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'solvai.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threads (
    id        TEXT PRIMARY KEY,
    data      TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS bots (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    avatar      TEXT NOT NULL,
    color       TEXT NOT NULL,
    flair       TEXT NOT NULL,
    karma       INTEGER NOT NULL DEFAULT 0,
    personality TEXT NOT NULL,
    isModerator INTEGER NOT NULL DEFAULT 0,
    isJudge     INTEGER NOT NULL DEFAULT 0,
    isDeepResearch INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bot_memories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    botId     TEXT NOT NULL,
    topic     TEXT NOT NULL,
    content   TEXT NOT NULL,
    source    TEXT,
    learnedAt TEXT NOT NULL,
    FOREIGN KEY (botId) REFERENCES bots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bot_translations (
    botId       TEXT NOT NULL,
    lang        TEXT NOT NULL,
    name        TEXT NOT NULL,
    flair       TEXT NOT NULL,
    personality TEXT NOT NULL,
    PRIMARY KEY (botId, lang)
  );
`);

// Migration: add 'active' column if missing (for existing DBs)
try {
  db.prepare('SELECT active FROM bots LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE bots ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  console.log('[DB] Migrated: added active column to bots');
}

// Migration: add 'isPollmaster' column if missing
try {
  db.prepare('SELECT isPollmaster FROM bots LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE bots ADD COLUMN isPollmaster INTEGER NOT NULL DEFAULT 0');
  console.log('[DB] Migrated: added isPollmaster column to bots');
}

// Migration: create bot_translations if missing (for existing DBs before i18n)
try {
  db.prepare('SELECT botId FROM bot_translations LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_translations (
      botId       TEXT NOT NULL,
      lang        TEXT NOT NULL,
      name        TEXT NOT NULL,
      flair       TEXT NOT NULL,
      personality TEXT NOT NULL,
      PRIMARY KEY (botId, lang)
    )
  `);
  console.log('[DB] Migrated: created bot_translations table');
}

// Migration: add 'opinion' column to bots if missing
try {
  db.prepare('SELECT opinion FROM bots LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE bots ADD COLUMN opinion TEXT NOT NULL DEFAULT ''");
  console.log('[DB] Migrated: added opinion column to bots');
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
const stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSetSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

function getSetting(key, fallback = null) {
  const row = stmtGetSetting.get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(key, value) {
  stmtSetSetting.run(key, JSON.stringify(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const row of rows) {
    try { obj[row.key] = JSON.parse(row.value); } catch { obj[row.key] = row.value; }
  }
  return obj;
}

function saveAllSettings(settingsObj) {
  const tx = db.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      stmtSetSetting.run(key, JSON.stringify(value));
    }
  });
  tx(settingsObj);
}

// ─── Thread helpers ───────────────────────────────────────────────────────────
const stmtInsertThread = db.prepare(
  'INSERT OR REPLACE INTO threads (id, data, createdAt, status) VALUES (?, ?, ?, ?)'
);
const stmtDeleteThread = db.prepare('DELETE FROM threads WHERE id = ?');
const stmtGetThread = db.prepare('SELECT data FROM threads WHERE id = ?');

function getAllThreads() {
  const rows = db.prepare('SELECT data FROM threads ORDER BY createdAt DESC').all();
  return rows.map(r => {
    const t = JSON.parse(r.data);
    t.typing = null; // transient state
    return t;
  });
}

function saveThread(thread) {
  stmtInsertThread.run(thread.id, JSON.stringify(thread), thread.createdAt, thread.status || 'active');
}

function saveAllThreads(threads) {
  const tx = db.transaction((list) => {
    for (const thread of list) {
      stmtInsertThread.run(thread.id, JSON.stringify(thread), thread.createdAt, thread.status || 'active');
    }
  });
  tx(threads);
}

function deleteThread(id) {
  stmtDeleteThread.run(id);
}

function getThread(id) {
  const row = stmtGetThread.get(id);
  if (!row) return null;
  const t = JSON.parse(row.data);
  t.typing = null;
  return t;
}

// ─── Bot helpers ──────────────────────────────────────────────────────────────
function seedBots(botCharacters) {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM bots').get().cnt;
  if (count > 0) {
    // Ensure new bots from config are inserted if missing
    const insertIfMissing = db.prepare(`
      INSERT OR IGNORE INTO bots (id, name, avatar, color, flair, karma, personality, isModerator, isJudge, isDeepResearch, isPollmaster, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const tx = db.transaction((bots) => {
      for (const b of bots) {
        insertIfMissing.run(
          b.id, b.name, b.avatar, b.color, b.flair, b.karma || 0, b.personality,
          b.isModerator ? 1 : 0, b.isJudge ? 1 : 0, b.isDeepResearch ? 1 : 0, b.isPollmaster ? 1 : 0
        );
      }
    });
    tx(botCharacters);
    return;
  }

  const insert = db.prepare(`
    INSERT INTO bots (id, name, avatar, color, flair, karma, personality, isModerator, isJudge, isDeepResearch, isPollmaster, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const tx = db.transaction((bots) => {
    for (const b of bots) {
      insert.run(
        b.id, b.name, b.avatar, b.color, b.flair, b.karma || 0, b.personality,
        b.isModerator ? 1 : 0, b.isJudge ? 1 : 0, b.isDeepResearch ? 1 : 0, b.isPollmaster ? 1 : 0
      );
    }
  });
  tx(botCharacters);
  console.log(`[DB] Seeded ${botCharacters.length} bots from config`);
}

function rowToBot(row) {
  if (!row) return null;
  return {
    ...row,
    isModerator: !!row.isModerator,
    isJudge: !!row.isJudge,
    isDeepResearch: !!row.isDeepResearch,
    isPollmaster: !!row.isPollmaster,
    active: !!row.active,
  };
}

function getAllBots() {
  return db.prepare('SELECT * FROM bots').all().map(rowToBot);
}

function getActiveBots() {
  return db.prepare('SELECT * FROM bots WHERE active = 1').all().map(rowToBot);
}

function getBot(id) {
  return rowToBot(db.prepare('SELECT * FROM bots WHERE id = ?').get(id));
}

function updateBot(id, fields) {
  const allowed = ['name', 'avatar', 'color', 'flair', 'karma', 'personality', 'opinion'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (updates.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE bots SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

function setBotActive(id, active) {
  db.prepare('UPDATE bots SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

function deleteBot(id) {
  db.prepare('DELETE FROM bots WHERE id = ?').run(id);
}

function addBot(bot) {
  db.prepare(`
    INSERT INTO bots (id, name, avatar, color, flair, karma, personality, isModerator, isJudge, isDeepResearch, isPollmaster, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    bot.id, bot.name, bot.avatar, bot.color, bot.flair, bot.karma || 0,
    bot.personality || '', bot.isModerator ? 1 : 0, bot.isJudge ? 1 : 0, bot.isDeepResearch ? 1 : 0, bot.isPollmaster ? 1 : 0
  );
  return getBot(bot.id);
}

// ─── Migrate existing threads.json into DB ────────────────────────────────────
function migrateThreadsJson() {
  const legacyFile = path.join(__dirname, 'data', 'threads.json');
  if (!fs.existsSync(legacyFile)) return;

  const existing = getAllThreads();
  if (existing.length > 0) return; // DB already has threads

  try {
    const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    if (Array.isArray(data) && data.length > 0) {
      saveAllThreads(data);
      console.log(`[DB] Migrated ${data.length} threads from threads.json`);
      // Rename so it doesn't migrate again
      fs.renameSync(legacyFile, legacyFile + '.bak');
    }
  } catch (e) {
    console.error('[DB] Failed to migrate threads.json:', e.message);
  }
}

// ─── Bot Memory helpers ───────────────────────────────────────────────────────
function getBotMemory(botId) {
  return db.prepare('SELECT * FROM bot_memories WHERE botId = ? ORDER BY learnedAt DESC').all(botId);
}

function getAllBotMemories() {
  return db.prepare('SELECT * FROM bot_memories ORDER BY learnedAt DESC').all();
}

function addBotMemory(botId, entry) {
  db.prepare(
    'INSERT INTO bot_memories (botId, topic, content, source, learnedAt) VALUES (?, ?, ?, ?, ?)'
  ).run(botId, entry.topic, entry.content, entry.source || null, new Date().toISOString());
  // Keep max 100 entries per bot
  const overflow = db.prepare(
    'SELECT id FROM bot_memories WHERE botId = ? ORDER BY learnedAt DESC LIMIT -1 OFFSET 100'
  ).all(botId);
  if (overflow.length > 0) {
    const ids = overflow.map(r => r.id);
    db.prepare(`DELETE FROM bot_memories WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
}

function clearBotMemory(botId) {
  db.prepare('DELETE FROM bot_memories WHERE botId = ?').run(botId);
}

function replaceBotMemory(botId, entries) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bot_memories WHERE botId = ?').run(botId);
    const insert = db.prepare(
      'INSERT INTO bot_memories (botId, topic, content, source, learnedAt) VALUES (?, ?, ?, ?, ?)'
    );
    for (const e of entries) {
      insert.run(botId, e.topic, e.content, e.source || null, e.learnedAt || new Date().toISOString());
    }
  });
  tx();
}

// ─── Bot Translation helpers ──────────────────────────────────────────────────
function saveBotTranslation(botId, lang, { name, flair, personality }) {
  db.prepare(
    'INSERT OR REPLACE INTO bot_translations (botId, lang, name, flair, personality) VALUES (?, ?, ?, ?, ?)'
  ).run(botId, lang, name, flair, personality);
}

function saveBotTranslationsBulk(lang, entries) {
  const tx = db.transaction((items) => {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO bot_translations (botId, lang, name, flair, personality) VALUES (?, ?, ?, ?, ?)'
    );
    for (const e of items) {
      stmt.run(e.botId, lang, e.name, e.flair, e.personality);
    }
  });
  tx(entries);
}

function getBotTranslations(lang) {
  return db.prepare('SELECT * FROM bot_translations WHERE lang = ?').all(lang);
}

function getBotTranslation(botId, lang) {
  return db.prepare('SELECT * FROM bot_translations WHERE botId = ? AND lang = ?').get(botId, lang) || null;
}

function deleteBotTranslations(botId) {
  db.prepare('DELETE FROM bot_translations WHERE botId = ?').run(botId);
}

// ─── Cleanup on process exit ──────────────────────────────────────────────────
process.on('exit', () => db.close());

module.exports = {
  db,
  getSetting,
  setSetting,
  getAllSettings,
  saveAllSettings,
  getAllThreads,
  saveThread,
  saveAllThreads,
  deleteThread,
  getThread,
  seedBots,
  getAllBots,
  getActiveBots,
  addBot,
  deleteBot: deleteBot,
  setBotActive,
  getBot,
  updateBot,
  migrateThreadsJson,
  getBotMemory,
  getAllBotMemories,
  addBotMemory,
  clearBotMemory,
  replaceBotMemory,
  saveBotTranslation,
  saveBotTranslationsBulk,
  getBotTranslations,
  getBotTranslation,
  deleteBotTranslations,
};
