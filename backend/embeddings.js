/**
 * embeddings.js — Semantische Thread-Suche via Gemini oder LM Studio Embeddings.
 *
 * Speichert Embedding-Vektoren aller Threads in data/embeddings.json.
 * Ermöglicht semantische Suche über Thread-Probleme und Lösungen.
 *
 * Unterstützt zwei Provider:
 * - "cloud" (default): Gemini Embedding API (braucht apiKey)
 * - "local": LM Studio OpenAI-kompatibler /v1/embeddings Endpoint
 *
 * Exportiert:
 * - embedThread(thread, settings)         — Einzelnen Thread embedden
 * - embedAllThreads(threads, settings)    — Alle Threads bulk-embedden
 * - semanticSearch(query, settings, k)    — Top-k ähnliche Threads finden
 * - removeEmbedding(threadId)             — Embedding löschen
 * - clearAllEmbeddings()                  — Alle Embeddings löschen (Provider-Wechsel)
 */
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const { DEFAULT_LOCAL_BASE_URL } = require('./config');

const EMBEDDINGS_FILE = path.join(__dirname, 'data', 'embeddings.json');
const EMBEDDING_MODEL = 'gemini-embedding-001';

// In-memory cache: { threadId -> { text, vector, provider, updatedAt } }
let embeddings = {};

// ── Load from disk ────────────────────────────────────────────────────────────
function loadEmbeddings() {
  try {
    if (fs.existsSync(EMBEDDINGS_FILE)) {
      embeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
    }
  } catch (_) {
    embeddings = {};
  }
}

function saveEmbeddings() {
  try {
    const dir = path.dirname(EMBEDDINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(embeddings));
  } catch (err) {
    console.error('[Embeddings] Save error:', err.message);
  }
}

// ── Generate embedding via Gemini SDK ─────────────────────────────────────────
async function generateGeminiEmbedding(text, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text.slice(0, 8000),
  });
  return response.embeddings?.[0]?.values || null;
}

// ── Generate embedding via LM Studio (OpenAI-kompatibel) ──────────────────────
async function generateLocalEmbedding(text, baseUrl, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const body = { input: text.slice(0, 8000) };
    if (model) body.model = model;
    const response = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`LM Studio Embedding: ${response.status}`);
    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('LM Studio Embedding Timeout (15s)');
    throw err;
  }
}

// ── Route to correct provider ─────────────────────────────────────────────────
async function generateEmbedding(text, settings) {
  const provider = settings.embeddingProvider || 'cloud';
  if (provider === 'local') {
    const baseUrl = (settings.localBaseUrl || DEFAULT_LOCAL_BASE_URL).replace(/\/+$/, '');
    const model = settings.localEmbeddingModel || '';
    return generateLocalEmbedding(text, baseUrl, model);
  }
  // Cloud (Gemini)
  if (!settings.apiKey) return null;
  return generateGeminiEmbedding(text, settings.apiKey);
}

// ── Build text representation of a thread ─────────────────────────────────────
function threadToText(thread) {
  const parts = [thread.problem];
  if (thread.solutions?.length) {
    parts.push('Lösungen: ' + thread.solutions.map(s => s.content).join(' | '));
  }
  if (thread.comments?.length) {
    // Only include first ~15 comments to keep it manageable
    const subset = thread.comments.slice(0, 15);
    parts.push('Diskussion: ' + subset.map(c => c.content).join(' '));
  }
  return parts.join('\n\n').slice(0, 8000);
}

// ── Embed a single thread ─────────────────────────────────────────────────────
async function embedThread(thread, settings) {
  const provider = settings?.embeddingProvider || 'cloud';
  if (provider === 'cloud' && !settings?.apiKey) return;
  try {
    const text = threadToText(thread);
    const vector = await generateEmbedding(text, settings);
    if (vector) {
      embeddings[thread.id] = { text: thread.problem, vector, provider, updatedAt: new Date().toISOString() };
      saveEmbeddings();
    }
  } catch (err) {
    console.error(`[Embeddings] Failed to embed thread ${thread.id}:`, err.message);
  }
}

// ── Embed all threads (bulk, on startup) ──────────────────────────────────────
async function embedAllThreads(threads, settings) {
  const provider = settings?.embeddingProvider || 'cloud';
  if (provider === 'cloud' && !settings?.apiKey) return;
  let count = 0;
  for (const thread of threads) {
    // Re-embed if provider changed, otherwise skip
    if (embeddings[thread.id] && embeddings[thread.id].provider === provider) continue;
    try {
      await embedThread(thread, settings);
      count++;
      // Rate limit: ~100ms between calls
      await new Promise(r => setTimeout(r, 100));
    } catch (_) {}
  }
  if (count > 0) console.log(`[Embeddings] Embedded ${count} threads (provider: ${provider})`);
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Semantic search ───────────────────────────────────────────────────────────
async function semanticSearch(query, settings, topK = 20) {
  const provider = settings?.embeddingProvider || 'cloud';
  if (provider === 'cloud' && !settings?.apiKey) return [];
  if (Object.keys(embeddings).length === 0) return [];

  const queryVector = await generateEmbedding(query, settings);
  if (!queryVector) return [];

  const results = Object.entries(embeddings)
    .filter(([, data]) => data.provider === provider) // nur gleicher Provider
    .map(([threadId, data]) => ({
      threadId,
      score: cosineSimilarity(queryVector, data.vector),
    }))
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

// ── Remove embedding for deleted thread ───────────────────────────────────────
function removeEmbedding(threadId) {
  delete embeddings[threadId];
  saveEmbeddings();
}

// ── Clear all embeddings (bei Provider-Wechsel) ──────────────────────────────
function clearAllEmbeddings() {
  embeddings = {};
  saveEmbeddings();
  console.log('[Embeddings] Cleared all embeddings (provider switch)');
}

// Initialize
loadEmbeddings();

module.exports = {
  embedThread,
  embedAllThreads,
  semanticSearch,
  removeEmbedding,
  clearAllEmbeddings,
};
