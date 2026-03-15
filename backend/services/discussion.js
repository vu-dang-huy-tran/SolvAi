/**
 * services/discussion.js — Bot-Diskussions-Orchestrierung.
 *
 * Steuert den Haupt-Loop einer Bot-Diskussion:
 * 1. generateBotProbabilities() → Welche Bots relevant sind
 * 2. Aufgaben-Verteilung (analyze, tech_solution, pro/contra, moderate, etc.)
 * 3. Sequenzielle Bot-Responses mit konfigurierbaren Intervallen
 * 4. Dynamische Injection von VerdictVictor, Bot-zu-Bot-Replies, Polls
 * 5. Thread-Abschluss via closeThread()
 */

const { v4: uuidv4 } = require('uuid');
const { store, saveThreads, broadcast, closeThread, resolveUpvote, findSimilarThreads,
        getActiveDbBots, findDbBot, getModelForBot, getIntervalForBot, getPromptForBot } = require('../store');
const { sleep, isConnectionError, rerankSolutions, getReplyTarget } = require('../helpers');
const { botLog } = require('../logger');
const botMemory = require('../bot-memory');
const { generateBotResponse, generateBotProbabilities } = require('../gemini');

// ─── Core Task Sequence ───────────────────────────────────────────────────────

const CORE_TASKS = [
  'analyze', 'tech_solution', 'org_solution',
  'pro_argument', 'create_poll', 'contra_argument',
  'pro_argument', 'contra_argument', 'moderate',
  'rate_solutions', 'upvote_comments', 'synthesize', 'conclude',
];

// ─── Main Discussion Loop ─────────────────────────────────────────────────────

async function runBotDiscussion(threadId) {
  const activeBots = getActiveDbBots();
  const mike   = activeBots.find(b => b.isModerator);
  const victor  = activeBots.find(b => b.isJudge);
  const paul    = activeBots.find(b => b.isPollmaster);
  const regularBots = activeBots.filter(b => !b.isModerator && !b.isJudge && !b.isPollmaster);

  // ── Bot-Wahrscheinlichkeiten berechnen ────────────────────────────────────
  let botProbabilities = {};
  const currentThread = store.threads.find(t => t.id === threadId);
  try {
    const probModel = store.settings?.probabilityModel;
    const probModelResolved = (typeof probModel === 'string' && probModel.trim()) ? probModel.trim() : undefined;
    console.log(`[BotProbabilities] Using model: ${probModelResolved || 'gemini-flash (default)'}`);

    botProbabilities = await generateBotProbabilities({
      problem: currentThread?.problem || '',
      bots: regularBots,
      apiKey: store.settings.apiKey,
      model: probModelResolved,
      localBaseUrl: store.settings.localBaseUrl,
      tavilyApiKey: store.settings.tavilyApiKey || '',
    });

    store.botProbabilities.set(threadId, botProbabilities);
    const probLines = regularBots.map(b => `${b.name}: ${(botProbabilities[b.id] * 100).toFixed(0)}%`).join(', ');
    botLog('SYSTEM', 'BOT_PROBABILITIES', `thread=${threadId} | ${probLines}`);
  } catch (err) {
    console.error('[BotProbabilities] Failed, using all bots:', err.message);
    for (const b of regularBots) botProbabilities[b.id] = 1.0;
  }

  // ── Bots auswählen (Würfelwurf pro Bot, min. 3) ──────────────────────────
  const joinedBots = regularBots.filter(b => Math.random() < (botProbabilities[b.id] || 0.5));
  if (joinedBots.length < 3) {
    const remaining = regularBots
      .filter(b => !joinedBots.includes(b))
      .sort((a, b) => (botProbabilities[b.id] || 0) - (botProbabilities[a.id] || 0));
    while (joinedBots.length < 3 && remaining.length > 0) joinedBots.push(remaining.shift());
  }

  botLog('SYSTEM', 'BOTS_JOINED', `thread=${threadId} | ${joinedBots.length} bots: ${joinedBots.map(b => b.name).join(', ')}`);
  const botPool = [...joinedBots].sort(() => Math.random() - 0.5);

  // ── Aufgaben zuweisen ─────────────────────────────────────────────────────
  const assignments = [];
  const plannedBots = new Set();
  let poolIndex = 0;

  for (const task of CORE_TASKS) {
    let bot;
    if (task === 'moderate') { bot = mike; }
    else if (task === 'create_poll') { bot = paul; }
    else { bot = botPool[poolIndex++ % botPool.length]; }
    assignments.push({ bot, task });
    if (bot && !bot.isModerator && !bot.isJudge && !bot.isPollmaster) {
      plannedBots.add(bot.id);
    }
  }

  // Sicherstellen dass jeder Bot mindestens einmal spricht
  const missedBots = joinedBots.filter(b => !plannedBots.has(b.id));
  const extraTasks = ['pro_argument', 'contra_argument', 'discuss', 'synthesize'];
  for (let j = 0; j < missedBots.length; j++) {
    const insertPos = Math.max(assignments.length - 1, 0);
    assignments.splice(insertPos, 0, { bot: missedBots[j], task: extraTasks[j % extraTasks.length] });
  }

  // ── Discussion Loop ───────────────────────────────────────────────────────
  const botsSpoken = new Set();
  let aborted = false;
  const controller = { abort: () => { aborted = true; } };
  store.activeDiscussions.set(threadId, controller);

  function getThread() {
    return store.threads.find(t => t.id === threadId);
  }

  for (let i = 0; i < assignments.length; i++) {
    if (aborted) break;
    const { bot, task } = assignments[i];

    await sleep(i > 0 ? getIntervalForBot(bot.id) : 1200);
    if (aborted) break;

    const thread = getThread();
    if (!thread) break;

    // Typing-Indicator
    thread.typing = bot.id;
    botLog(bot.name, 'TYPING', `task=${task} thread=${threadId}`);
    broadcast({ type: 'bot_typing', threadId, botId: bot.id, botName: bot.name, task });

    try {
      const usedModel = getModelForBot(bot.id);
      const conversationHistory = thread.comments.map(c => ({
        botName: c.isHuman ? '👤 User' : (findDbBot(c.botId)?.name || 'Unknown'),
        content: c.content,
        attachments: c.attachments || [],
      }));

      const result = await generateBotResponse({
        bot, problem: thread.problem, threadAttachments: thread.attachments || [],
        conversationHistory, task, apiKey: store.settings.apiKey,
        model: usedModel, localBaseUrl: store.settings.localBaseUrl,
        solutions: thread.solutions, personalityOverride: getPromptForBot(bot.id),
        similarThreads: findSimilarThreads(threadId, thread.problem),
        botMemory: botMemory.getMemory(bot.id),
        tavilyApiKey: store.settings.tavilyApiKey || '',
        lang: store.settings.language || 'de',
      });

      if (aborted) break;
      thread.typing = null;

      const { content, solution, solutionType, stance, stanceTarget, voteResults,
              upvoteTarget, verdictClose, callVerdict, pollQuestion, pollOptions, pollVote } = result;

      botLog(bot.name, 'RESPONSE', `task=${task} thread=${threadId} chars=${content.length}${solution ? ' +solution(' + solutionType + ')' : ''}${stance ? ' stance=' + stance : ''}${verdictClose !== null ? ' verdict=' + (verdictClose ? 'CLOSE' : 'CONTINUE') : ''}`);

      // Kommentar erstellen
      const comment = {
        id: uuidv4(), botId: bot.id, content, task, stance, stanceTarget,
        createdAt: new Date().toISOString(), upvotes: 0,
        replyTo: getReplyTarget(thread.comments, i, bot.id),
        model: usedModel,
      };
      thread.comments.push(comment);

      // Upvote auflösen
      resolveUpvote(thread, upvoteTarget, threadId);

      // Stance auf Lösungen anwenden
      if (stance && stanceTarget && thread.solutions.length > 0) {
        applyStance(thread, stance, stanceTarget);
      }

      // Vote-Ergebnisse anwenden
      if (voteResults?.length > 0) {
        for (const { index, score } of voteResults) {
          if (thread.solutions[index]) thread.solutions[index].votes += score;
        }
        rerankSolutions(thread);
      }

      // Lösung speichern und broadcasten
      if (solution) {
        const solutionObj = createSolution(comment.id, bot.id, solution, solutionType);
        thread.solutions.push(solutionObj);
        rerankSolutions(thread);
        saveThreads();
        broadcast({ type: 'solution_proposed', threadId, comment, solution: solutionObj, solutions: thread.solutions });
      } else {
        saveThreads();
        broadcast({ type: 'comment_added', threadId, comment });
        if ((stance && stanceTarget) || voteResults) {
          broadcast({ type: 'solutions_updated', threadId, solutions: thread.solutions });
        }
      }

      // ── Dynamische Injections ───────────────────────────────────────────
      // VerdictVictor anfordern
      if (callVerdict && victor && task !== 'close_verdict') {
        const nextIdx = i + 1;
        if (nextIdx >= assignments.length || assignments[nextIdx].task !== 'close_verdict') {
          assignments.splice(nextIdx, 0, { bot: victor, task: 'close_verdict' });
          botLog(bot.name, 'CALL_VERDICT', `${bot.name} called VerdictVictor`);
        }
      }

      // Track gesprochene Bots → Verdict injizieren
      if (bot && !bot.isModerator && !bot.isJudge && !bot.isPollmaster) {
        botsSpoken.add(bot.id);
      }

      const verdictInterval = store.settings.verdictInterval || 0;
      const totalComments = thread.comments.filter(c => !c.isHuman).length;
      const shouldVerdictByInterval = verdictInterval > 0 && totalComments > 0 && totalComments % verdictInterval === 0;
      const shouldVerdictByAllSpoken = verdictInterval === 0 && joinedBots.every(b => botsSpoken.has(b.id));

      if ((shouldVerdictByInterval || shouldVerdictByAllSpoken) && task !== 'close_verdict' && victor) {
        const nextIdx = i + 1;
        if (nextIdx >= assignments.length || assignments[nextIdx].task !== 'close_verdict') {
          assignments.splice(nextIdx, 0, { bot: victor, task: 'close_verdict' });
        }
      }

      // Bot-zu-Bot Reply (60% Chance)
      if (task !== 'bot_direct_reply' && comment.replyTo) {
        const repliedTo = thread.comments.find(c => c.id === comment.replyTo);
        if (repliedTo && !repliedTo.isHuman && repliedTo.botId !== bot.id && Math.random() < 0.6) {
          const repliedToBot = findDbBot(repliedTo.botId);
          if (repliedToBot) assignments.splice(i + 1, 0, { bot: repliedToBot, task: 'bot_direct_reply' });
        }
      }

      // Poll erstellen + Vote-Tasks queuen
      if (task === 'create_poll' && pollQuestion && pollOptions?.length >= 2) {
        handlePollCreation(thread, threadId, bot, pollQuestion, pollOptions, assignments, i, activeBots);
      }

      // Poll-Vote registrieren
      if (task === 'vote_poll' && pollVote !== null && thread.polls?.length > 0) {
        handlePollVote(thread, threadId, bot, pollVote);
      }

      // Upvote-Runde: alle Bots queuen
      if (task === 'upvote_comments' && !thread._upvoteRoundQueued && thread.comments.length > 1) {
        thread._upvoteRoundQueued = true;
        const upvoters = [...activeBots].filter(b => b.id !== bot.id).sort(() => Math.random() - 0.5);
        assignments.splice(i + 1, 0, ...upvoters.map(ub => ({ bot: ub, task: 'upvote_comments' })));
      }

      // Status auf 'discussing' setzen nach erstem Bot
      if (i === 0) {
        thread.status = 'discussing';
        broadcast({ type: 'thread_status', threadId, status: 'discussing' });
      }

      // Verdict verarbeiten
      if (task === 'close_verdict' && verdictClose !== null) {
        if (verdictClose && thread.solutions.length > 0) {
          closeThread(threadId, { verdict: 'close', embed: true });
          aborted = true;
        } else {
          broadcast({ type: 'thread_status', threadId, status: 'discussing', verdict: 'continue' });
          await runExtraRound(threadId);
          if (!aborted) closeThread(threadId, { verdict: 'continue_closed', embed: true });
          aborted = true;
        }
      }

    } catch (err) {
      thread.typing = null;
      broadcast({ type: 'bot_error', threadId, botId: bot.id, message: err.message });
      botLog(bot.name, 'ERROR', `task=${task} | ${err.message}`);
      console.error(`[Bot ${bot.name}] Error:`, err.message);
      if (isConnectionError(err)) {
        console.warn(`[Discussion] LM Studio/Ollama nicht erreichbar — Diskussion pausiert`);
        broadcast({ type: 'bot_error', threadId, botId: 'system', message: 'Lokales Modell nicht erreichbar. Diskussion pausiert.' });
        break;
      }
    }
  }

  if (!aborted) closeThread(threadId, { embed: true });
  store.activeDiscussions.delete(threadId);
}

// ─── Extra Round (nach CONTINUE-Verdict) ──────────────────────────────────────

async function runExtraRound(threadId) {
  const pool = getActiveDbBots().filter(b => !b.isModerator && !b.isJudge);
  const extraBots = [...pool].sort(() => Math.random() - 0.5).slice(0, 6);
  const extraTasks = ['pro_argument', 'contra_argument', 'discuss', 'pro_argument', 'contra_argument', 'conclude'];

  for (let i = 0; i < extraBots.length; i++) {
    const bot = extraBots[i];
    const task = extraTasks[i];
    await sleep(getIntervalForBot(bot.id));

    const thread = store.threads.find(t => t.id === threadId);
    if (!thread || thread.status === 'resolved') break;

    thread.typing = bot.id;
    botLog(bot.name, 'TYPING', `task=${task} thread=${threadId} (extra-round)`);
    broadcast({ type: 'bot_typing', threadId, botId: bot.id, botName: bot.name, task });

    try {
      const usedModel = getModelForBot(bot.id);
      const conversationHistory = thread.comments.map(c => ({
        botName: c.isHuman ? '👤 User' : (findDbBot(c.botId)?.name || 'Unknown'),
        content: c.content,
        attachments: c.attachments || [],
      }));

      const { content, solution, solutionType, stance, stanceTarget } = await generateBotResponse({
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
      if (thread.status === 'resolved') break;

      botLog(bot.name, 'RESPONSE', `task=${task} thread=${threadId} chars=${content.length} (extra-round)`);
      const comment = {
        id: uuidv4(), botId: bot.id, content, task, stance, stanceTarget,
        createdAt: new Date().toISOString(), upvotes: 0, replyTo: null, model: usedModel,
      };
      thread.comments.push(comment);

      if (solution) {
        const solutionObj = createSolution(comment.id, bot.id, solution, solutionType);
        thread.solutions.push(solutionObj);
        rerankSolutions(thread);
        saveThreads();
        broadcast({ type: 'solution_proposed', threadId, comment, solution: solutionObj, solutions: thread.solutions });
      } else {
        if (stance && stanceTarget && thread.solutions.length > 0) applyStance(thread, stance, stanceTarget);
        saveThreads();
        broadcast({ type: 'comment_added', threadId, comment });
        if (stance && stanceTarget) broadcast({ type: 'solutions_updated', threadId, solutions: thread.solutions });
      }
    } catch (err) {
      const t = store.threads.find(t => t.id === threadId);
      if (t) t.typing = null;
      botLog(bot.name, 'ERROR', `task=${task} (extra-round) | ${err.message}`);
      console.error(`[ExtraRound ${bot.name}] Error:`, err.message);
      if (isConnectionError(err)) break;
    }
  }
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function applyStance(thread, stance, stanceTarget) {
  const target = stanceTarget.toLowerCase();
  const matched = thread.solutions.find(s =>
    s.content.toLowerCase().includes(target.slice(0, 25)) ||
    target.includes(s.content.toLowerCase().slice(0, 25))
  ) || thread.solutions[thread.solutions.length - 1];

  if (matched) {
    if (stance === 'pro')    { matched.proCount++;   matched.votes += 2; }
    if (stance === 'contra') { matched.contraCount++; matched.votes -= 1; }
    rerankSolutions(thread);
  }
}

function createSolution(commentId, botId, content, type) {
  return {
    id: uuidv4(), commentId, proposedBy: botId,
    content, type: type || 'tech',
    votes: 0, proCount: 0, contraCount: 0, rank: 0,
    createdAt: new Date().toISOString(),
  };
}

function handlePollCreation(thread, threadId, bot, pollQuestion, pollOptions, assignments, i, activeBots) {
  if (!thread.polls) thread.polls = [];
  const newPoll = {
    id: uuidv4(),
    question: pollQuestion,
    options: pollOptions.map(text => ({ text, votes: 0, voters: [] })),
    createdBy: bot.id,
    createdAt: new Date().toISOString(),
  };
  thread.polls.push(newPoll);
  saveThreads();
  broadcast({ type: 'poll_created', threadId, polls: thread.polls });
  botLog(bot.name, 'POLL_CREATED', `question="${pollQuestion}" options=${pollOptions.length}`);

  // Vote-Tasks für alle Bots queuen
  const allVoters = [...activeBots].filter(b => b.id !== bot.id).sort(() => Math.random() - 0.5);
  const voteTasks = allVoters.map(voterBot => ({
    bot: { ...voterBot, _pollQuestion: pollQuestion, _pollOptions: pollOptions, _pollId: newPoll.id },
    task: 'vote_poll',
  }));
  assignments.splice(i + 1, 0, ...voteTasks);
}

function handlePollVote(thread, threadId, bot, pollVote) {
  const targetPoll = bot._pollId
    ? thread.polls.find(p => p.id === bot._pollId)
    : thread.polls[thread.polls.length - 1];
  if (!targetPoll) return;

  const optIdx = pollVote - 1;
  if (optIdx >= 0 && optIdx < targetPoll.options.length) {
    targetPoll.options[optIdx].votes++;
    targetPoll.options[optIdx].voters.push(bot.id);
    saveThreads();
    broadcast({ type: 'poll_vote', threadId, polls: thread.polls, votedBy: bot.id, optionIndex: optIdx });
    botLog(bot.name, 'POLL_VOTE', `option=${pollVote} "${targetPoll.options[optIdx].text}"`);
  }
}

module.exports = { runBotDiscussion, runExtraRound };
