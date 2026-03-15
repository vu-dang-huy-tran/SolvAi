/**
 * helpers.js — Reine Hilfsfunktionen ohne State-Abhängigkeit.
 *
 * Enthält Sanitize-Funktionen für Settings, Model-IDs, Bot-Konfiguration,
 * sowie allgemeine Utilities (sleep, isConnectionError, rerankSolutions).
 */

const { DEFAULT_MODEL, DEFAULT_LOCAL_BASE_URL } = require('./config');

// ─── Model-ID Sanitization ───────────────────────────────────────────────────

function sanitizeModelId(model, fallback = DEFAULT_MODEL) {
  if (typeof model !== 'string') return fallback;
  let trimmed = model.trim();
  if (!trimmed) return fallback;
  trimmed = trimmed.slice(0, 120);
  if (!trimmed.startsWith('lmstudio:') && !trimmed.startsWith('ollama:') && !trimmed.startsWith('gemini')) {
    trimmed = `lmstudio:${trimmed}`;
  }
  return trimmed;
}

function sanitizeCustomModels(models) {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const model of models) {
    if (typeof model !== 'string') continue;
    let trimmed = model.trim();
    if (!trimmed || trimmed.length > 120) continue;
    if (!trimmed.startsWith('lmstudio:') && !trimmed.startsWith('ollama:') && !trimmed.startsWith('gemini')) {
      trimmed = `lmstudio:${trimmed}`;
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
}

// ─── Bot-Settings Sanitization ────────────────────────────────────────────────

function sanitizeBotModels(botModels, fallbackModel, botIdSet) {
  const defaults = {};
  if (!botModels || typeof botModels !== 'object' || Array.isArray(botModels)) {
    return defaults;
  }
  for (const [botId, model] of Object.entries(botModels)) {
    if (botIdSet && !botIdSet.has(botId)) continue;
    defaults[botId] = sanitizeModelId(model, fallbackModel);
  }
  return defaults;
}

function sanitizeBotIntervals(botIntervals, botIdSet) {
  const defaults = {};
  if (!botIntervals || typeof botIntervals !== 'object' || Array.isArray(botIntervals)) return defaults;
  for (const [botId, val] of Object.entries(botIntervals)) {
    if (botIdSet && !botIdSet.has(botId)) continue;
    const num = Number(val);
    if (Number.isFinite(num) && num >= 1000 && num <= 60000) {
      defaults[botId] = Math.round(num);
    }
  }
  return defaults;
}

function sanitizeBotPrompts(botPrompts, botIdSet) {
  const defaults = {};
  if (!botPrompts || typeof botPrompts !== 'object' || Array.isArray(botPrompts)) return defaults;
  for (const [botId, val] of Object.entries(botPrompts)) {
    if (botIdSet && !botIdSet.has(botId)) continue;
    if (typeof val === 'string' && val.trim()) {
      defaults[botId] = val.trim().slice(0, 2000);
    }
  }
  return defaults;
}

// ─── Full Settings Sanitization ───────────────────────────────────────────────

function sanitizeSettings(input = {}, current = {}, buildDefaultBotModels) {
  const fallbackModel = sanitizeModelId(input.model ?? current.model ?? DEFAULT_MODEL, DEFAULT_MODEL);
  const customModels = sanitizeCustomModels(input.customModels ?? current.customModels ?? []);
  const intervalRaw = input.interval ?? current.interval ?? 10000;
  const interval = Number.isFinite(Number(intervalRaw))
    ? Math.min(60000, Math.max(1000, Math.round(Number(intervalRaw))))
    : 10000;
  const apiKeyRaw = input.apiKey ?? current.apiKey ?? '';
  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';
  const localBaseUrl = sanitizeLocalBaseUrl(input.localBaseUrl ?? current.localBaseUrl ?? DEFAULT_LOCAL_BASE_URL);

  const defaultBotModels = buildDefaultBotModels ? buildDefaultBotModels(fallbackModel) : {};
  const inputBotModels = input.botModels ?? current.botModels;
  const botModels = { ...defaultBotModels };
  if (inputBotModels && typeof inputBotModels === 'object' && !Array.isArray(inputBotModels)) {
    for (const [botId, model] of Object.entries(inputBotModels)) {
      botModels[botId] = sanitizeModelId(model, fallbackModel);
    }
  }

  const botIntervals = sanitizeBotIntervals(input.botIntervals ?? current.botIntervals);
  const botPrompts = sanitizeBotPrompts(input.botPrompts ?? current.botPrompts);

  const learningEnabled = typeof (input.learningEnabled ?? current.learningEnabled) === 'boolean'
    ? (input.learningEnabled ?? current.learningEnabled)
    : true;
  const learningIntervalRaw = input.learningInterval ?? current.learningInterval ?? 15;
  const learningInterval = Number.isFinite(Number(learningIntervalRaw))
    ? Math.min(120, Math.max(1, Math.round(Number(learningIntervalRaw))))
    : 15;

  return {
    interval,
    apiKey,
    localBaseUrl,
    model: fallbackModel,
    customModels,
    botModels,
    botIntervals,
    botPrompts,
    learningEnabled,
    learningInterval,
    learningModel: typeof (input.learningModel ?? current.learningModel) === 'string'
      ? (input.learningModel ?? current.learningModel ?? '').trim().slice(0, 120)
      : '',
    tavilyApiKey: typeof (input.tavilyApiKey ?? current.tavilyApiKey) === 'string'
      ? (input.tavilyApiKey ?? current.tavilyApiKey ?? '').trim().slice(0, 200)
      : '',
    probabilityModel: typeof (input.probabilityModel ?? current.probabilityModel) === 'string'
      ? (input.probabilityModel ?? current.probabilityModel ?? '').trim().slice(0, 120)
      : '',
    embeddingProvider: ['cloud', 'local'].includes(input.embeddingProvider ?? current.embeddingProvider)
      ? (input.embeddingProvider ?? current.embeddingProvider)
      : 'cloud',
    localEmbeddingModel: typeof (input.localEmbeddingModel ?? current.localEmbeddingModel) === 'string'
      ? (input.localEmbeddingModel ?? current.localEmbeddingModel ?? '').trim().slice(0, 200)
      : '',
    verdictInterval: (() => {
      const raw = input.verdictInterval ?? current.verdictInterval ?? 0;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 10 ? Math.round(n / 10) * 10 : 0;
    })(),
    language: (() => {
      const valid = ['de', 'en', 'zh', 'hi', 'es', 'fr', 'ar', 'pt'];
      const raw = input.language ?? current.language ?? 'de';
      return valid.includes(raw) ? raw : 'de';
    })(),
  };
}

// ─── URL Sanitization ─────────────────────────────────────────────────────────

function sanitizeLocalBaseUrl(localBaseUrl, fallback = DEFAULT_LOCAL_BASE_URL) {
  if (typeof localBaseUrl !== 'string') return fallback;
  const trimmed = localBaseUrl.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, '');
}

// ─── General Utilities ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isConnectionError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('econnrefused') || msg.includes('econnreset') ||
    msg.includes('etimedout') || msg.includes('enotfound') ||
    msg.includes('socket hang up') || msg.includes('fetch failed') ||
    msg.includes('websocket') || msg.includes('lm studio') ||
    msg.includes('connect');
}

function rerankSolutions(thread) {
  thread.solutions.sort((a, b) => b.votes - a.votes);
  thread.solutions.forEach((s, i) => { s.rank = i + 1; });
}

/**
 * Wählt ein Reply-Target für Bot-Kommentare.
 * 60% Chance auf Reply an einen der letzten 3 Kommentare (nie eigene).
 */
function getReplyTarget(comments, index, currentBotId = null) {
  if (comments.length === 0) return null;
  if (Math.random() > 0.4 && comments.length > 0) {
    const recent = comments.slice(-3).filter(c => !currentBotId || c.botId !== currentBotId);
    if (recent.length === 0) return null;
    return recent[Math.floor(Math.random() * recent.length)].id;
  }
  return null;
}

module.exports = {
  sanitizeModelId,
  sanitizeCustomModels,
  sanitizeBotModels,
  sanitizeBotIntervals,
  sanitizeBotPrompts,
  sanitizeSettings,
  sanitizeLocalBaseUrl,
  sleep,
  isConnectionError,
  rerankSolutions,
  getReplyTarget,
};
