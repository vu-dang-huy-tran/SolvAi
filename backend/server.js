/**
 * server.js — Express-Entry-Point (schlanker Aufbau).
 *
 * Verantwortlich für:
 * - Express-Setup (CORS, JSON, statische Dateien, Multer)
 * - SSE-Endpoint (Echtzeit-Updates an Frontend)
 * - Route-Registrierung (Threads, Bots, Settings)
 * - Dependency Injection (Services → Routes, vermeidet zirkuläre Imports)
 * - Startup-Tasks (Resume, Embedding, Learning, Patrol)
 * - Globale Fehlerbehandlung
 *
 * Alle Business-Logik lebt in:
 *   routes/     — HTTP-Handler
 *   services/   — Bot-Orchestrierung (Discussion, Reactions, Learning)
 *   store.js    — In-Memory-State + SSE-Broadcast
 *   gemini.js   — LLM-Aufrufe
 *   prompts.js  — Prompt-Templates
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// ─── App-Module ───────────────────────────────────────────────────────────────
const { UPLOAD_DIR, ALLOWED_MIME, MAX_FILE_SIZE, VICTOR_PATROL_INTERVAL } = require('./config');
const { store, broadcast, getAllDbBots } = require('./store');
const { isConnectionError } = require('./helpers');
const { botLog } = require('./logger');
const { BOT_CHARACTERS } = require('./bots');
const database = require('./database');
const { embedAllThreads } = require('./embeddings');

// ─── Routes ───────────────────────────────────────────────────────────────────
const { router: threadRouter, setDiscussionHandler, setReactionsHandler } = require('./routes/threads');
const { router: botRouter, setLearningHandlers, handleBotStats, handleBotLogs } = require('./routes/bots');
const { router: settingsRouter, setLearningCycleHandler, handleLocalModels } = require('./routes/settings');

// ─── Services ─────────────────────────────────────────────────────────────────
const { runBotDiscussion } = require('./services/discussion');
const { triggerBotReactions, victorPatrol } = require('./services/reactions');
const { learnSingleBot, runBotLearningRound, restartLearningCycle, startBotLearningCycle } = require('./services/learning');

// ─── DB Seed & Migration ──────────────────────────────────────────────────────
database.seedBots(BOT_CHARACTERS);
database.migrateThreadsJson();

// ─── Express App Setup ────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── File Upload (Multer) ─────────────────────────────────────────────────────
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_MIME.includes(file.mimetype);
    cb(ok ? null : new Error(`Unsupported: ${file.mimetype}`), ok);
  },
});

app.use('/uploads', express.static(UPLOAD_DIR));

// ─── SSE Endpoint ─────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const clientId = uuidv4();
  store.sseClients.push({ id: clientId, res });

  // Aktuellen State sofort senden (API keys stay in-memory only, never sent to client)
  const { apiKey: _a, tavilyApiKey: _t, ...initSettings } = store.settings;
  res.write(`data: ${JSON.stringify({ type: 'init', threads: store.threads, settings: initSettings, bots: getAllDbBots() })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    store.sseClients = store.sseClients.filter(c => c.id !== clientId);
  });
});

// ─── Dependency Injection (vermeidet zirkuläre Imports) ───────────────────────
setDiscussionHandler(runBotDiscussion);
setReactionsHandler(triggerBotReactions);
setLearningHandlers(runBotLearningRound, learnSingleBot);
setLearningCycleHandler(restartLearningCycle);

// ─── Route Registration ───────────────────────────────────────────────────────
// Threads (mit Multer für File-Uploads bei POST)
app.use('/api/threads', upload.array('files', 5), threadRouter);

// Bots
app.use('/api/bots', botRouter);

// Settings
app.use('/api/settings', settingsRouter);

// Eigenständige Endpunkte (Frontend erwartet genau diese Pfade)
app.get('/api/local-models', handleLocalModels);
app.get('/api/stats/bots', handleBotStats);
app.get('/api/logs/bots', handleBotLogs);

// ─── Multer Error Handling ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
  }
  if (err.message?.startsWith('Unsupported')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ─── Startup: Unfinished Threads fortsetzen ───────────────────────────────────
async function resumeActiveThreads() {
  const unfinished = store.threads.filter(t => t.status === 'active' || t.status === 'discussing');
  if (unfinished.length === 0) return;

  console.log(`[Startup] Resuming ${unfinished.length} unfinished thread(s)...`);
  const { saveThreads } = require('./store');
  const { sleep } = require('./helpers');

  for (const thread of unfinished) {
    if (thread.typing) {
      thread.typing = null;
      saveThreads();
    }
    await sleep(2000);
    console.log(`[Startup] Resuming thread ${thread.id.slice(0, 8)}... (${thread.comments.length} comments)`);
    runBotDiscussion(thread.id).catch(err =>
      console.error(`[Startup] Failed to resume ${thread.id.slice(0, 8)}:`, err.message)
    );
  }
}

// ─── Globale Fehlerbehandlung ─────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
  botLog('SYSTEM', 'UNHANDLED_REJECTION', String(reason?.message || reason).slice(0, 300));
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
  botLog('SYSTEM', 'UNCAUGHT_EXCEPTION', err.message?.slice(0, 300));
  if (!isConnectionError(err)) {
    process.exit(1);
  }
});

// ─── Server starten ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🤖 SolvAI API running on http://localhost:${PORT}`);
  console.log(`   SSE stream: http://localhost:${PORT}/api/events\n`);

  // Startup-Tasks
  resumeActiveThreads();
  setTimeout(() => embedAllThreads(store.threads, store.settings).catch(() => {}), 3000);
  startBotLearningCycle();
});

// Victor-Patrol: Periodisch offene Threads prüfen
setInterval(() => {
  victorPatrol().catch(err => console.error('[Patrol error]', err.message));
}, VICTOR_PATROL_INTERVAL);
