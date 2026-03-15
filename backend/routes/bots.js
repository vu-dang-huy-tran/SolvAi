/**
 * routes/bots.js — Bot-Verwaltung, Memory, Stats, Activity-Log.
 *
 * Endpunkte:
 *   GET    /api/bots                  — Alle Bots auflisten
 *   POST   /api/bots/generate         — Bot mit KI generieren
 *   POST   /api/bots                  — Bot manuell erstellen
 *   PATCH  /api/bots/:id              — Bot bearbeiten
 *   PATCH  /api/bots/:id/active       — Bot aktivieren/deaktivieren
 *   DELETE /api/bots/:id              — Bot löschen
 *   GET    /api/bots/memory/all       — Alle Bot-Memories
 *   POST   /api/bots/learn            — Manuelles Learning für alle Bots
 *   POST   /api/bots/:id/learn        — Manuelles Learning für einen Bot
 *   GET    /api/bots/:id/memory       — Memory eines Bots
 *   DELETE /api/bots/:id/memory       — Memory eines Bots löschen
 *   GET    /api/stats/bots            — Bot-Statistiken
 *   GET    /api/logs/bots             — Bot-Aktivitätslog
 */

const { Router } = require('express');
const fs = require('fs');
const database = require('../database');
const botMemory = require('../bot-memory');
const { store, broadcast, getModelForBot, getAllDbBots } = require('../store');
const { generateBotConfig, translateSingleBot } = require('../gemini');
const { LOG_FILE } = require('../config');

// Wird vom Server injiziert
let _runBotLearningRound = null;
let _learnSingleBot = null;

function setLearningHandlers(roundFn, singleFn) {
  _runBotLearningRound = roundFn;
  _learnSingleBot = singleFn;
}

const router = Router();

// ─── List All Bots ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json(database.getAllBots());
});

// ─── Generate Bot with AI ─────────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { description } = req.body;
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Beschreibung ist erforderlich' });
  }
  try {
    const config = await generateBotConfig({
      description: description.trim(),
      apiKey: store.settings.apiKey,
      model: store.settings.model,
    });
    res.json(config);
  } catch (err) {
    console.error('Bot generation failed:', err.message);
    res.status(500).json({ error: err.message || 'Bot-Generierung fehlgeschlagen' });
  }
});

// ─── Translate Bots ───────────────────────────────────────────────────────────
router.post('/translate', async (req, res) => {
  const { targetLang, previousLang } = req.body;
  const validLangs = ['de', 'en', 'zh', 'hi', 'es', 'fr', 'ar', 'pt'];
  if (!targetLang || !validLangs.includes(targetLang)) {
    return res.status(400).json({ error: 'Invalid target language' });
  }
  try {
    const allBots = database.getAllBots();
    const currentLang = (previousLang && validLangs.includes(previousLang)) ? previousLang : 'de';

    // 1) Save current bot data under the CURRENT language (before switching)
    database.saveBotTranslationsBulk(currentLang, allBots.map(b => ({
      botId: b.id, name: b.name, flair: b.flair, personality: b.personality,
    })));

    // 2) For each bot: use cache if available, otherwise translate via LLM
    const total = allBots.length;
    const cacheEntries = [];
    let translatedCount = 0;
    for (let i = 0; i < total; i++) {
      const bot = allBots[i];
      const cached = database.getBotTranslation(bot.id, targetLang);
      if (cached) {
        // Restore from cache
        database.updateBot(bot.id, { name: cached.name, flair: cached.flair, personality: cached.personality });
        broadcast({ type: 'bot_translating', botId: bot.id, botName: cached.name, current: i + 1, total, fromCache: true });
        translatedCount++;
      } else {
        // No cache → translate via LLM
        broadcast({ type: 'bot_translating', botId: bot.id, botName: bot.name, current: i + 1, total, fromCache: false });
        try {
          const result = await translateSingleBot({
            bot,
            targetLang,
            apiKey: store.settings.apiKey,
            model: store.settings.model,
            localBaseUrl: store.settings.localBaseUrl,
          });
          const updates = {};
          if (typeof result.name === 'string' && result.name.trim()) updates.name = result.name.trim().slice(0, 120);
          if (typeof result.flair === 'string' && result.flair.trim()) updates.flair = result.flair.trim().slice(0, 120);
          if (typeof result.personality === 'string' && result.personality.trim()) updates.personality = result.personality.trim().slice(0, 2000);
          if (Object.keys(updates).length > 0) {
            database.updateBot(bot.id, updates);
            const updatedBot = database.getBot(bot.id);
            cacheEntries.push({
              botId: bot.id,
              name: updatedBot.name,
              flair: updatedBot.flair,
              personality: updatedBot.personality,
            });
            translatedCount++;
          }
        } catch (err) {
          console.error(`Translation failed for bot ${bot.id}:`, err.message);
        }
      }
      // Broadcast updated bots after each bot
      broadcast({ type: 'bots_updated', bots: database.getAllBots() });
    }
    if (cacheEntries.length > 0) {
      database.saveBotTranslationsBulk(targetLang, cacheEntries);
    }

    res.json({ ok: true, translated: translatedCount, fromCache: false });
  } catch (err) {
    console.error('Bot translation failed:', err.message);
    res.status(500).json({ error: err.message || 'Translation failed' });
  }
});

// ─── Create Bot ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, avatar, color, flair, personality } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const id = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60);
  if (database.getBot(id)) {
    return res.status(409).json({ error: 'Bot with this ID already exists' });
  }
  const bot = database.addBot({
    id,
    name: name.trim().slice(0, 120),
    avatar: (typeof avatar === 'string' && avatar.trim()) ? avatar.trim().slice(0, 10) : '🤖',
    color: (typeof color === 'string' && color.trim()) ? color.trim().slice(0, 20) : '#8B949E',
    flair: (typeof flair === 'string' && flair.trim()) ? flair.trim().slice(0, 120) : 'Custom Bot',
    personality: (typeof personality === 'string' && personality.trim()) ? personality.trim().slice(0, 2000) : '',
    karma: 0,
  });
  broadcast({ type: 'bots_updated', bots: database.getAllBots() });
  res.json(bot);
});

// ─── Update Bot ───────────────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const bot = database.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  const allowed = {};
  for (const key of ['name', 'avatar', 'color', 'flair', 'personality']) {
    if (typeof req.body[key] === 'string' && req.body[key].trim()) {
      allowed[key] = req.body[key].trim().slice(0, key === 'personality' ? 2000 : 120);
    }
  }
  if (typeof req.body.karma === 'number') allowed.karma = req.body.karma;
  database.updateBot(req.params.id, allowed);
  // Invalidate translation cache for this bot (content changed → re-translate on next switch)
  database.deleteBotTranslations(req.params.id);
  broadcast({ type: 'bots_updated', bots: database.getAllBots() });
  res.json(database.getBot(req.params.id));
});

// ─── Toggle Bot Active ────────────────────────────────────────────────────────
router.patch('/:id/active', (req, res) => {
  const bot = database.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (bot.isJudge && !req.body.active) return res.status(403).json({ error: 'VerdictVictor kann nicht deaktiviert werden' });
  database.setBotActive(req.params.id, !!req.body.active);
  broadcast({ type: 'bots_updated', bots: database.getAllBots() });
  res.json(database.getBot(req.params.id));
});

// ─── Delete Bot ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const bot = database.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (bot.isJudge) return res.status(403).json({ error: 'VerdictVictor kann nicht gelöscht werden' });
  database.deleteBot(req.params.id);
  database.deleteBotTranslations(req.params.id);
  broadcast({ type: 'bots_updated', bots: database.getAllBots() });
  res.json({ ok: true });
});

// ─── Bot Memory ───────────────────────────────────────────────────────────────
router.get('/memory/all', (req, res) => {
  res.json(botMemory.getAllMemories());
});

router.post('/learn', (req, res) => {
  if (_runBotLearningRound) {
    _runBotLearningRound().catch(err => console.error('[BotLearning] Manual trigger error:', err.message));
  }
  res.json({ ok: true, message: 'Learning round triggered' });
});

router.post('/:id/learn', async (req, res) => {
  const bot = database.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  const apiKey = store.settings?.apiKey;
  const model = getModelForBot(bot.id);
  const isLocal = /^(ollama|lmstudio):/i.test(model);
  if (!isLocal && !apiKey) return res.status(400).json({ error: 'No API key configured' });
  if (_learnSingleBot) {
    _learnSingleBot(bot, apiKey).catch(err => console.error(`[BotLearning] Single-bot error (${bot.name}):`, err.message));
  }
  res.json({ ok: true, botId: bot.id, botName: bot.name });
});

router.get('/:id/memory', (req, res) => {
  const bot = database.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json(botMemory.getMemory(req.params.id));
});

router.delete('/:id/memory', (req, res) => {
  const bot = database.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  botMemory.clearMemory(req.params.id);
  res.json({ ok: true });
});

// ─── Bot Stats (als /api/stats/bots in server.js registriert) ────────────────
function handleBotStats(req, res) {
  const allBots = database.getAllBots();
  const statsMap = {};

  for (const bot of allBots) {
    statsMap[bot.id] = { id: bot.id, name: bot.name, avatar: bot.avatar, color: bot.color, flair: bot.flair, comments: 0, solutions: 0, likes: 0 };
  }

  for (const thread of store.threads) {
    for (const comment of (thread.comments || [])) {
      if (comment.isHuman || !comment.botId || !statsMap[comment.botId]) continue;
      statsMap[comment.botId].comments += 1;
      statsMap[comment.botId].likes += (comment.upvotes || 0);
    }
    for (const solution of (thread.solutions || [])) {
      if (!solution.proposedBy || !statsMap[solution.proposedBy]) continue;
      statsMap[solution.proposedBy].solutions += 1;
    }
  }

  const stats = Object.values(statsMap).filter(s => s.comments > 0 || s.solutions > 0);
  stats.sort((a, b) => b.comments - a.comments);
  res.json(stats);
}

// ─── Bot Activity Log (als /api/logs/bots in server.js registriert) ──────────
function handleBotLogs(req, res) {
  try {
    if (!fs.existsSync(LOG_FILE)) return res.json({ lines: [] });
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    res.json({ lines: lines.slice(-500) });
  } catch {
    res.json({ lines: [] });
  }
}

module.exports = { router, setLearningHandlers, handleBotStats, handleBotLogs };
