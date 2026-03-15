/**
 * routes/settings.js — Einstellungen und lokale Modelle.
 *
 * Endpunkte:
 *   GET    /api/settings              — Aktuelle Einstellungen
 *   POST   /api/settings              — Einstellungen speichern
 *   GET    /api/local-models          — LM Studio / Ollama Modelle auflisten
 */

const { Router } = require('express');
const database = require('../database');
const { store, broadcast, buildDefaultBotModels } = require('../store');
const { sanitizeSettings, sanitizeLocalBaseUrl } = require('../helpers');
const { DEFAULT_LOCAL_BASE_URL, DEFAULT_OLLAMA_BASE_URL } = require('../config');
const { clearAllEmbeddings, embedAllThreads } = require('../embeddings');

// Wird vom Server injiziert
let _restartLearningCycle = null;
function setLearningCycleHandler(fn) { _restartLearningCycle = fn; }

const router = Router();

// ─── Get Settings ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { apiKey, tavilyApiKey, ...safe } = store.settings;
  res.json(safe);
});

// ─── Save Settings ────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const oldProvider = store.settings.embeddingProvider || 'cloud';
  const oldEmbeddingModel = store.settings.localEmbeddingModel || '';
  store.settings = sanitizeSettings(req.body, store.settings, buildDefaultBotModels);

  // API keys stay in-memory only — never persist to DB or broadcast via SSE
  const { apiKey, tavilyApiKey, ...settingsForDb } = store.settings;
  database.saveAllSettings(settingsForDb);
  broadcast({ type: 'settings_updated', settings: settingsForDb });
  if (_restartLearningCycle) _restartLearningCycle();

  // Bei Provider- oder Modell-Wechsel: Embeddings löschen und neu generieren
  const newProvider = store.settings.embeddingProvider || 'cloud';
  const newEmbeddingModel = store.settings.localEmbeddingModel || '';
  if (oldProvider !== newProvider || (newProvider === 'local' && oldEmbeddingModel !== newEmbeddingModel)) {
    clearAllEmbeddings();
    setTimeout(() => embedAllThreads(store.threads, store.settings).catch(() => {}), 500);
  }

  res.json(settingsForDb);
});

// ─── Local Models (als /api/local-models in server.js registriert) ────────────
async function handleLocalModels(req, res) {
  const provider = typeof req.query.provider === 'string'
    ? req.query.provider.toLowerCase()
    : 'lmstudio';
  const requestedBaseUrl = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : '';

  try {
    if (provider === 'lmstudio') {
      const baseUrl = sanitizeLocalBaseUrl(requestedBaseUrl, DEFAULT_LOCAL_BASE_URL);
      const models = await loadLmStudioModels(baseUrl);
      return res.json({ provider, baseUrl, models });
    }
    if (provider === 'ollama') {
      const baseUrl = sanitizeLocalBaseUrl(requestedBaseUrl, DEFAULT_OLLAMA_BASE_URL);
      const models = await loadOllamaModels(baseUrl);
      return res.json({ provider, baseUrl, models });
    }
    return res.status(400).json({ error: 'Unsupported provider. Use "lmstudio" or "ollama".' });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Lokale Modelle konnten nicht geladen werden.' });
  }
}

// ─── Model Loading Helpers ────────────────────────────────────────────────────

async function loadLmStudioModels(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LM Studio antwortet mit ${response.status}: ${text || 'keine Details'}`);
    }
    const data = await response.json();
    const models = Array.isArray(data?.data)
      ? data.data.map(item => item?.id).filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())
      : [];
    return [...new Set(models)];
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`LM Studio nicht erreichbar (${baseUrl}) — Timeout nach 5s`);
    }
    throw err;
  }
}

async function loadOllamaModels(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama antwortet mit ${response.status}: ${text || 'keine Details'}`);
    }
    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models.map(item => item?.name).filter(name => typeof name === 'string' && name.trim()).map(name => name.trim())
      : [];
    return [...new Set(models)];
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`Ollama nicht erreichbar (${baseUrl}) — Timeout nach 5s`);
    }
    throw err;
  }
}

module.exports = { router, setLearningCycleHandler, handleLocalModels };
