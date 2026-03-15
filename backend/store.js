/**
 * store.js — Zentraler In-Memory-State und SSE-Broadcast.
 *
 * Singleton-Modul das den gesamten Laufzeit-State verwaltet:
 * - Threads (geladen aus SQLite, in-memory für schnellen Zugriff)
 * - Settings (geladen aus SQLite)
 * - SSE-Clients (für Echtzeit-Updates an Frontend)
 * - Active Discussions/Reactions (AbortController pro Thread)
 * - Bot Probabilities (Thread → Bot-Wahrscheinlichkeiten)
 *
 * Stellt auch State-modifizierende Hilfsfunktionen bereit
 * (closeThread, resolveUpvote, broadcast, save/load).
 */

const { v4: uuidv4 } = require('uuid');
const database = require('./database');
const { DEFAULT_MODEL } = require('./config');
const { sanitizeSettings, rerankSolutions } = require('./helpers');
const { botLog } = require('./logger');
const { embedThread } = require('./embeddings');

// ─── DB Bot Accessors ─────────────────────────────────────────────────────────

function getActiveDbBots() { return database.getActiveBots(); }
function getAllDbBots() { return database.getAllBots(); }
function findDbBot(id) { return database.getBot(id); }
function getDbBotIdSet() { return new Set(getAllDbBots().map(b => b.id)); }

function buildDefaultBotModels(model = DEFAULT_MODEL) {
  return getActiveDbBots().reduce((acc, bot) => {
    acc[bot.id] = model;
    return acc;
  }, {});
}

// ─── Thread Persistence ───────────────────────────────────────────────────────

function loadThreads() {
  try {
    return database.getAllThreads();
  } catch (e) {
    console.error('Failed to load threads:', e.message);
  }
  return [];
}

function loadSettingsFromDb() {
  const saved = database.getAllSettings();
  return sanitizeSettings(saved, {}, buildDefaultBotModels);
}

// ─── The Store ────────────────────────────────────────────────────────────────

const store = {
  threads: loadThreads(),
  settings: loadSettingsFromDb(),
  sseClients: [],
  activeDiscussions: new Map(), // threadId → abort controller
  activeReactions: new Map(),   // threadId → abort controller
  botProbabilities: new Map(),  // threadId → { botId: probability }
};

// ─── Debounced Thread Save ────────────────────────────────────────────────────

let saveTimer = null;
function saveThreads() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      database.saveAllThreads(store.threads);
    } catch (e) {
      console.error('Failed to save threads:', e.message);
    }
  }, 500);
}

// ─── SSE Broadcast ────────────────────────────────────────────────────────────

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  store.sseClients.forEach(client => {
    try { client.res.write(data); } catch (_) {}
  });
}

// ─── Thread Operations ────────────────────────────────────────────────────────

/**
 * Schließt einen Thread: Stoppt alle Bot-Aktivität, rankt Lösungen, broadcastet.
 * MUSS bei jedem Thread-Schließen aufgerufen werden.
 */
function closeThread(threadId, { verdict = 'close', embed = false } = {}) {
  const thread = store.threads.find(t => t.id === threadId);
  if (!thread) return;

  thread.status = 'resolved';
  thread.typing = null;

  const dCtrl = store.activeDiscussions.get(threadId);
  if (dCtrl) dCtrl.abort();
  store.activeDiscussions.delete(threadId);

  const rCtrl = store.activeReactions.get(threadId);
  if (rCtrl) rCtrl.abort();
  store.activeReactions.delete(threadId);

  rerankSolutions(thread);
  saveThreads();
  broadcast({ type: 'thread_resolved', threadId, solutions: thread.solutions, verdict });

  if (embed) {
    embedThread(thread, store.settings).catch(() => {});
  }

  botLog('SYSTEM', 'THREAD_CLOSED', `thread=${threadId} verdict=${verdict}`);
}

/**
 * Löst ein Bot-Upvote auf einen vorherigen Kommentar auf.
 * Unterstützt Index (1-basiert) und @BotName-Format.
 */
function resolveUpvote(thread, upvoteTarget, threadId) {
  if (!upvoteTarget) return;
  const num = parseInt(upvoteTarget);
  let target = null;
  if (!isNaN(num) && thread.comments[num - 1]) {
    target = thread.comments[num - 1];
  } else {
    const name = upvoteTarget.replace(/^@/, '').toLowerCase();
    for (let j = thread.comments.length - 1; j >= 0; j--) {
      const c = thread.comments[j];
      if (!c.isHuman) {
        const bot = findDbBot(c.botId);
        if (bot && bot.name.toLowerCase() === name) {
          target = c;
          break;
        }
      }
    }
  }
  if (target) {
    target.upvotes = (target.upvotes || 0) + 1;
    broadcast({ type: 'comment_upvoted', threadId, commentId: target.id, upvotes: target.upvotes });
  }
}

// ─── Settings Accessors ───────────────────────────────────────────────────────

function getModelForBot(botId) {
  const model = store.settings?.botModels?.[botId];
  if (typeof model === 'string' && model.trim()) return model;
  return store.settings?.model || DEFAULT_MODEL;
}

function getIntervalForBot(botId) {
  const val = store.settings?.botIntervals?.[botId];
  if (typeof val === 'number' && val >= 1000) return val;
  return store.settings?.interval || 10000;
}

function getPromptForBot(botId) {
  const val = store.settings?.botPrompts?.[botId];
  if (typeof val === 'string' && val.trim()) return val.trim();
  return null;
}

// ─── Similar Threads (Keyword-basiert) ────────────────────────────────────────

const GERMAN_STOP_WORDS = new Set([
  'der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'ich', 'du', 'er', 'sie',
  'es', 'wir', 'ist', 'hat', 'von', 'mit', 'auf', 'für', 'zu', 'in', 'an',
  'den', 'dem', 'des', 'nicht', 'wie', 'was', 'kann', 'man', 'auch', 'aber',
  'wenn', 'noch', 'nur', 'dass', 'wird', 'hab', 'habe', 'mein', 'dein', 'bin',
  'war', 'sind', 'als', 'bei', 'nach', 'über', 'vor', 'schon', 'mal', 'so',
  'da', 'hier', 'einen', 'einer', 'einem', 'mich', 'mir', 'dir', 'uns', 'sich',
  'meine', 'keine', 'kein', 'alle', 'viel', 'mehr', 'sehr', 'will', 'soll',
  'zum', 'zur', 'im', 'am',
]);

function findSimilarThreads(currentThreadId, problem) {
  const words = problem.toLowerCase()
    .replace(/[^a-zäöüß\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !GERMAN_STOP_WORDS.has(w));
  if (words.length === 0) return [];

  const wordSet = new Set(words);

  return store.threads
    .filter(t => t.id !== currentThreadId && t.comments.length > 0)
    .map(t => {
      const tWords = t.problem.toLowerCase().replace(/[^a-zäöüß\s]/g, '').split(/\s+/);
      const matches = tWords.filter(w => wordSet.has(w)).length;
      const score = matches / Math.max(wordSet.size, 1);
      const topSolution = t.solutions?.sort((a, b) => b.votes - a.votes)[0] || null;
      return { id: t.id, problem: t.problem, status: t.status, score, commentCount: t.comments.length, topSolution };
    })
    .filter(t => t.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  store,
  // Persistence
  saveThreads,
  loadSettingsFromDb,
  // SSE
  broadcast,
  // Thread operations
  closeThread,
  resolveUpvote,
  findSimilarThreads,
  // Bot DB accessors
  getActiveDbBots,
  getAllDbBots,
  findDbBot,
  getDbBotIdSet,
  buildDefaultBotModels,
  // Settings accessors
  getModelForBot,
  getIntervalForBot,
  getPromptForBot,
};
