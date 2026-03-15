/**
 * routes/threads.js — Thread CRUD, Suche, Kommentare, Solution-Voting.
 *
 * Endpunkte:
 *   POST   /api/threads                              — Neuen Thread erstellen
 *   GET    /api/threads                              — Alle Threads
 *   GET    /api/threads/search?q=...                 — Semantische + Keyword-Suche
 *   GET    /api/threads/:id                          — Einzelner Thread
 *   DELETE /api/threads/:id                          — Thread löschen
 *   PATCH  /api/threads/:id/status                   — Status ändern (active/discussing/resolved)
 *   POST   /api/threads/:threadId/comments           — User-Kommentar posten
 *   POST   /api/threads/:threadId/solutions/:id/vote — Lösung up/downvoten
 */

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { store, saveThreads, broadcast, closeThread, getAllDbBots, findDbBot } = require('../store');
const { rerankSolutions } = require('../helpers');
const { botLog } = require('../logger');
const { UPLOAD_DIR } = require('../config');
const { embedThread, semanticSearch, removeEmbedding } = require('../embeddings');
const database = require('../database');

// Diese werden vom Server injiziert (vermeidet zirkuläre Abhängigkeiten)
let _runBotDiscussion = null;
let _triggerBotReactions = null;

function setDiscussionHandler(fn) { _runBotDiscussion = fn; }
function setReactionsHandler(fn) { _triggerBotReactions = fn; }

const router = Router();

// ─── Create Thread ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { problem } = req.body;
  if (!problem || !problem.trim()) {
    return res.status(400).json({ error: 'Problem text is required' });
  }

  const attachments = (req.files || []).map(f => ({
    id: uuidv4(),
    originalName: f.originalname,
    filename: f.filename,
    mimeType: f.mimetype,
    size: f.size,
    url: `/uploads/${f.filename}`,
  }));

  const thread = {
    id: uuidv4(),
    problem: problem.trim(),
    attachments,
    createdAt: new Date().toISOString(),
    status: 'active',
    comments: [],
    solutions: [],
    typing: null,
  };

  store.threads.unshift(thread);
  saveThreads();
  broadcast({ type: 'thread_created', thread });
  embedThread(thread, store.settings).catch(() => {});
  res.json(thread);

  if (_runBotDiscussion) {
    _runBotDiscussion(thread.id).catch(err =>
      console.error(`[Discussion] Failed to start for ${thread.id}:`, err.message)
    );
  }
});

// ─── List Threads ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json(store.threads);
});

// ─── Search Threads ───────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);

  function buildResult(t, score) {
    return {
      id: t.id,
      problem: t.problem,
      status: t.status,
      commentCount: (t.comments || []).length,
      solutionCount: (t.solutions || []).length,
      createdAt: t.createdAt,
      topSolution: t.solutions?.sort((a, b) => b.votes - a.votes)[0]?.content.slice(0, 120) || null,
      score,
    };
  }

  // Semantische Suche (wenn Provider verfuegbar)
  const embeddingReady = store.settings.embeddingProvider === 'local' || store.settings.apiKey;
  try {
    if (embeddingReady) {
      const semantic = await semanticSearch(q, store.settings, 20);
      if (semantic.length > 0) {
        const results = semantic
          .map(r => {
            const t = store.threads.find(t => t.id === r.threadId);
            return t ? buildResult(t, r.score) : null;
          })
          .filter(Boolean);
        if (results.length > 0) return res.json(results);
      }
    }
  } catch (err) {
    console.error('[Search] Semantic search failed, falling back to keyword:', err.message);
  }

  // Keyword-Fallback
  const stopWords = new Set(['der','die','das','und','oder','ein','eine','ich','du','er','sie','es','wir','ist','hat','von','mit','auf','für','zu','in','an','den','dem','des','nicht','wie','was','kann','man','auch','aber','wenn','noch','nur','dass','wird','hab','habe','mein','dein','bin','war','sind','als','bei','nach','über','vor','schon','mal','so','da','hier']);
  const ql = q.toLowerCase();
  const queryWords = ql.replace(/[^a-zäöüß0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
  if (queryWords.length === 0) return res.json([]);

  const results = store.threads.map(t => {
    const problemLower = t.problem.toLowerCase();
    const commentsText = (t.comments || []).map(c => c.content).join(' ').toLowerCase();
    const solutionsText = (t.solutions || []).map(s => s.content).join(' ').toLowerCase();

    let score = 0;
    for (const word of queryWords) {
      if (problemLower.includes(word)) score += 3;
      if (commentsText.includes(word)) score += 1;
      if (solutionsText.includes(word)) score += 2;
    }
    if (problemLower.includes(ql)) score += 5;
    return score > 0 ? buildResult(t, score) : null;
  })
  .filter(Boolean)
  .sort((a, b) => b.score - a.score)
  .slice(0, 20);

  res.json(results);
});

// ─── Get Thread ───────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const thread = store.threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  res.json(thread);
});

// ─── Delete Thread ────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const idx = store.threads.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const thread = store.threads[idx];
  const allAttachments = [
    ...(thread.attachments || []),
    ...thread.comments.flatMap(c => c.attachments || []),
  ];
  for (const att of allAttachments) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, att.filename)); } catch (_) {}
  }

  store.activeDiscussions.delete(id);
  store.threads.splice(idx, 1);
  database.deleteThread(id);
  removeEmbedding(id);
  saveThreads();
  broadcast({ type: 'thread_deleted', threadId: id });
  res.json({ ok: true });
});

// ─── Update Thread Status ─────────────────────────────────────────────────────
router.patch('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'discussing', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status. Erlaubt: active, discussing, resolved' });
  }

  const thread = store.threads.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const oldStatus = thread.status;
  thread.status = status;
  thread.typing = null;

  if (status === 'resolved') {
    closeThread(id, { verdict: 'user_closed' });
    botLog('USER', 'THREAD_CLOSED', `thread=${id}`);
  } else {
    saveThreads();
    broadcast({ type: 'thread_status', threadId: id, status });
    botLog('USER', 'THREAD_REOPENED', `thread=${id} from=${oldStatus} to=${status}`);
    if (oldStatus === 'resolved' && _runBotDiscussion) {
      _runBotDiscussion(id).catch(err =>
        console.error(`[Reopen] Failed to restart discussion for ${id}:`, err.message)
      );
    }
  }

  res.json({ ok: true, status: thread.status });
});

// ─── Post User Comment ────────────────────────────────────────────────────────
router.post('/:threadId/comments', async (req, res) => {
  const { message, replyTo = null } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

  const thread = store.threads.find(t => t.id === req.params.threadId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const attachments = (req.files || []).map(f => ({
    id: uuidv4(),
    originalName: f.originalname,
    filename: f.filename,
    mimeType: f.mimetype,
    size: f.size,
    url: `/uploads/${f.filename}`,
  }));

  const comment = {
    id: uuidv4(),
    botId: 'human',
    isHuman: true,
    content: message.trim(),
    attachments,
    task: 'user_input',
    createdAt: new Date().toISOString(),
    upvotes: 0,
    replyTo: replyTo || null,
  };

  thread.comments.push(comment);
  thread.status = 'discussing';
  saveThreads();
  broadcast({ type: 'comment_added', threadId: thread.id, comment });
  broadcast({ type: 'thread_status', threadId: thread.id, status: 'discussing' });
  res.json(comment);

  // Direkte Antwort an Bot erkennen
  const repliedComment = replyTo ? thread.comments.find(c => c.id === replyTo) : null;
  const directReplyBotId = repliedComment && !repliedComment.isHuman ? repliedComment.botId : null;

  // @Mentions parsen
  const mentionedBotIds = [];
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(message)) !== null) {
    const mentionName = match[1].toLowerCase();
    const bot = getAllDbBots().find(b => b.name.toLowerCase() === mentionName);
    if (bot && bot.id !== directReplyBotId) mentionedBotIds.push(bot.id);
  }

  if (_triggerBotReactions) {
    _triggerBotReactions(thread.id, directReplyBotId, mentionedBotIds).catch(err =>
      console.error(`[Reactions] Failed for ${thread.id}:`, err.message)
    );
  }
});

// ─── Vote on Solution ─────────────────────────────────────────────────────────
router.post('/:threadId/solutions/:solutionId/vote', (req, res) => {
  const thread = store.threads.find(t => t.id === req.params.threadId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const solution = thread.solutions.find(s => s.id === req.params.solutionId);
  if (!solution) return res.status(404).json({ error: 'Solution not found' });

  solution.votes += req.body.direction === 'up' ? 1 : -1;
  rerankSolutions(thread);
  saveThreads();

  broadcast({ type: 'solutions_updated', threadId: thread.id, solutions: thread.solutions });
  res.json({ ok: true, solutions: thread.solutions });
});

module.exports = { router, setDiscussionHandler, setReactionsHandler };
