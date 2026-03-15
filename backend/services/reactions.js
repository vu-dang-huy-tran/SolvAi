/**
 * services/reactions.js — User-Reaktionen, Verdict-Check, Victor-Patrol.
 *
 * Steuert was passiert wenn ein User in einen Thread kommentiert:
 * 1. Direkte Bot-Antworten (Reply, @Mention)
 * 2. Zufällige Check-Ins anderer Bots
 * 3. VerdictVictor prüft ob Thread abgeschlossen werden kann
 * 4. Victor-Patrol: Periodisch offene Threads prüfen
 */

const { v4: uuidv4 } = require('uuid');
const { store, saveThreads, broadcast, closeThread, resolveUpvote, findSimilarThreads,
        getActiveDbBots, findDbBot, getModelForBot, getIntervalForBot, getPromptForBot } = require('../store');
const { sleep, isConnectionError, rerankSolutions } = require('../helpers');
const { botLog } = require('../logger');
const botMemory = require('../bot-memory');
const { generateBotResponse } = require('../gemini');
const { runExtraRound } = require('./discussion');

// ─── Bot Reactions auf User-Kommentar ─────────────────────────────────────────

async function triggerBotReactions(threadId, directReplyBotId = null, mentionedBotIds = []) {
  let reactionAborted = false;
  const reactionCtrl = { abort: () => { reactionAborted = true; } };

  // Vorherige Reaction-Chain abbrechen
  const prev = store.activeReactions.get(threadId);
  if (prev) prev.abort();
  store.activeReactions.set(threadId, reactionCtrl);

  const pool = getActiveDbBots().filter(b => !b.isModerator && !b.isJudge);

  // Check-In-Liste: Zufällige Bots + erzwungene Bots (Reply/Mention)
  const forcedIds = new Set([directReplyBotId, ...mentionedBotIds].filter(Boolean));
  const checkins = pool
    .filter(b => !forcedIds.has(b.id))
    .filter(() => Math.random() < 0.7)
    .map(bot => ({
      bot,
      delay: Math.floor(Math.random() * 2 + 1) * getIntervalForBot(bot.id),
      task: 'react_to_user',
    }))
    .sort((a, b) => a.delay - b.delay);

  // Direkt-Reply an erster Stelle
  if (directReplyBotId) {
    const directBot = pool.find(b => b.id === directReplyBotId);
    if (directBot) {
      checkins.unshift({ bot: directBot, delay: getIntervalForBot(directBot.id), task: 'direct_reply' });
    }
  }

  // @Mentions direkt nach Reply
  for (const mentionId of mentionedBotIds) {
    const mentionBot = pool.find(b => b.id === mentionId) || findDbBot(mentionId);
    if (mentionBot) {
      const insertPos = directReplyBotId ? 1 : 0;
      checkins.splice(insertPos, 0, { bot: mentionBot, delay: getIntervalForBot(mentionBot.id), task: 'direct_reply' });
      botLog('USER', 'MENTION', `@${mentionBot.name} in thread=${threadId}`);
    }
  }

  // Min. 1 Bot muss antworten
  if (checkins.length === 0) {
    const fallback = pool[Math.floor(Math.random() * pool.length)];
    checkins.push({ bot: fallback, delay: getIntervalForBot(fallback.id), task: 'react_to_user' });
  }

  // ── Reactions ausführen ───────────────────────────────────────────────────
  let elapsed = 0;
  for (const { bot, delay, task } of checkins) {
    if (reactionAborted) break;
    await sleep(delay - elapsed);
    elapsed = delay;

    const thread = store.threads.find(t => t.id === threadId);
    if (!thread || thread.status === 'resolved' || reactionAborted) break;

    thread.typing = bot.id;
    broadcast({ type: 'bot_typing', threadId, botId: bot.id, botName: bot.name, task });

    try {
      const usedModel = getModelForBot(bot.id);
      const conversationHistory = thread.comments.map(c => ({
        botName: c.isHuman ? '👤 User' : (findDbBot(c.botId)?.name || 'Unknown'),
        content: c.content,
        attachments: c.attachments || [],
      }));

      const { content, solution, solutionType, stance, stanceTarget, upvoteTarget, verdictClose } = await generateBotResponse({
        bot, problem: thread.problem, threadAttachments: thread.attachments || [],
        conversationHistory, task, apiKey: store.settings.apiKey,
        model: usedModel, localBaseUrl: store.settings.localBaseUrl,
        solutions: thread.solutions, personalityOverride: getPromptForBot(bot.id),
        similarThreads: findSimilarThreads(threadId, thread.problem),
        botMemory: botMemory.getMemory(bot.id),
        tavilyApiKey: store.settings.tavilyApiKey || '',
        lang: store.settings.language || 'de',
      });

      thread.typing = null;
      if (reactionAborted || thread.status === 'resolved') break;

      botLog(bot.name, 'RESPONSE', `task=react_to_user thread=${threadId} chars=${content.length}${solution ? ' +solution' : ''}`);

      const comment = {
        id: uuidv4(), botId: bot.id, content, task, stance, stanceTarget,
        createdAt: new Date().toISOString(), upvotes: 0,
        replyTo: thread.comments.filter(c => c.isHuman).slice(-1)[0]?.id || null,
        model: usedModel,
      };
      thread.comments.push(comment);
      resolveUpvote(thread, upvoteTarget, threadId);

      // Stance anwenden
      if (stance && stanceTarget && thread.solutions.length > 0) {
        const target = stanceTarget.toLowerCase();
        const matched = thread.solutions.find(s =>
          s.content.toLowerCase().includes(target.slice(0, 25)) ||
          target.includes(s.content.toLowerCase().slice(0, 25))
        ) || thread.solutions[thread.solutions.length - 1];
        if (matched) {
          if (stance === 'pro')    { matched.proCount++;    matched.votes += 2; }
          if (stance === 'contra') { matched.contraCount++; matched.votes -= 1; }
          rerankSolutions(thread);
        }
      }

      if (solution) {
        const solutionObj = {
          id: uuidv4(), commentId: comment.id, proposedBy: bot.id,
          content: solution, type: solutionType || 'tech',
          votes: 0, proCount: 0, contraCount: 0, rank: 0,
          createdAt: new Date().toISOString(),
        };
        thread.solutions.push(solutionObj);
        rerankSolutions(thread);
        saveThreads();
        broadcast({ type: 'solution_proposed', threadId, comment, solution: solutionObj, solutions: thread.solutions });
      } else {
        saveThreads();
        broadcast({ type: 'comment_added', threadId, comment });
        if (stance && stanceTarget) broadcast({ type: 'solutions_updated', threadId, solutions: thread.solutions });
      }

      // VerdictVictor kann Thread schließen
      if (bot.isJudge && verdictClose === true && thread.solutions.length > 0) {
        botLog(bot.name, 'VERDICT', `thread=${threadId} verdict=CLOSE (via mention)`);
        closeThread(threadId, { verdict: 'close' });
        break;
      }
    } catch (err) {
      const t = store.threads.find(t => t.id === threadId);
      if (t) t.typing = null;
      broadcast({ type: 'bot_error', threadId, botId: bot.id, message: err.message });
      botLog(bot.name, 'ERROR', `task=react_to_user | ${err.message}`);
      console.error(`[Reaction ${bot.name}] Error:`, err.message);
      if (isConnectionError(err)) break;
    }
  }

  store.activeReactions.delete(threadId);

  // Nach allen Reactions: VerdictVictor prüfen
  if (!reactionAborted) {
    const finalThread = store.threads.find(t => t.id === threadId);
    if (finalThread && finalThread.status !== 'resolved') {
      await runVerdictCheck(threadId);
    }
  }
}

// ─── Verdict Check ────────────────────────────────────────────────────────────

async function runVerdictCheck(threadId) {
  const t = store.threads.find(t => t.id === threadId);
  if (!t || t.status === 'resolved') return;

  const victor = getActiveDbBots().find(b => b.isJudge);
  if (!victor) return;

  await sleep(getIntervalForBot(victor.id));

  const thread = store.threads.find(t => t.id === threadId);
  if (!thread || thread.status === 'resolved') return;

  thread.typing = victor.id;
  botLog(victor.name, 'TYPING', `task=close_verdict thread=${threadId}`);
  broadcast({ type: 'bot_typing', threadId, botId: victor.id, botName: victor.name, task: 'close_verdict' });

  try {
    const conversationHistory = thread.comments.map(c => ({
      botName: c.isHuman ? '👤 User' : (findDbBot(c.botId)?.name || 'Unknown'),
      content: c.content,
      attachments: c.attachments || [],
    }));

    const victorModel = getModelForBot(victor.id);
    const { content, verdictClose } = await generateBotResponse({
      bot: victor, problem: thread.problem, threadAttachments: thread.attachments || [],
      conversationHistory, task: 'close_verdict', apiKey: store.settings.apiKey,
      model: victorModel, localBaseUrl: store.settings.localBaseUrl,
      solutions: thread.solutions, personalityOverride: getPromptForBot(victor.id),
      similarThreads: findSimilarThreads(threadId, thread.problem),
      botMemory: botMemory.getMemory(victor.id),
      tavilyApiKey: store.settings.tavilyApiKey || '',
      lang: store.settings.language || 'de',
    });

    thread.typing = null;
    if (thread.status === 'resolved') return;

    botLog(victor.name, 'VERDICT', `thread=${threadId} verdict=${verdictClose ? 'CLOSE' : 'CONTINUE'}`);
    const comment = {
      id: uuidv4(), botId: victor.id, content, task: 'close_verdict',
      createdAt: new Date().toISOString(), upvotes: 0, replyTo: null, model: victorModel,
    };
    thread.comments.push(comment);
    saveThreads();
    broadcast({ type: 'comment_added', threadId, comment });

    if (verdictClose === true && thread.solutions.length > 0) {
      closeThread(threadId, { verdict: 'close' });
    } else {
      await runExtraRound(threadId);
      closeThread(threadId, { verdict: 'continue_closed' });
    }
  } catch (err) {
    closeThread(threadId);
    botLog(victor.name, 'ERROR', `task=close_verdict | ${err.message}`);
    console.error(`[VerdictCheck] Error:`, err.message);
  }
}

// ─── Victor Patrol (periodisch offene Threads prüfen) ─────────────────────────

async function victorPatrol() {
  const openThreads = store.threads.filter(
    t => t.status === 'discussing' && !store.activeDiscussions.has(t.id)
  );

  for (const thread of openThreads) {
    if (Math.random() > 0.45) continue; // 45% Chance pro Thread
    console.log(`[VerdictVictor Patrol] Checking thread: ${thread.id.slice(0, 8)}...`);
    await runVerdictCheck(thread.id);
    await sleep(3000);
  }
}

module.exports = { triggerBotReactions, runVerdictCheck, victorPatrol };
