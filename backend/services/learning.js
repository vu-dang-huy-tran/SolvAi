/**
 * services/learning.js — Automatisches Bot-Lernen.
 *
 * Bots recherchieren periodisch neue Fakten zu ihren Fachgebieten.
 * - learnSingleBot(): Ein Bot recherchiert + konsolidiert Wissen
 * - runBotLearningRound(): 3-5 zufällige Bots lernen
 * - scheduleLearningRound(): Self-scheduling Timer
 * - startBotLearningCycle(): Startet den Zyklus beim Server-Start
 */

const { store, getActiveDbBots, getModelForBot, broadcast } = require('../store');
const { sleep } = require('../helpers');
const { botLog } = require('../logger');
const { DEFAULT_LOCAL_BASE_URL } = require('../config');
const botMemory = require('../bot-memory');
const { generateBotLearning, consolidateBotMemory, generateBotOpinion } = require('../gemini');
const database = require('../database');

let learningRunning = false;
let learningTimerId = null;

// ─── Single Bot Learning ──────────────────────────────────────────────────────

async function learnSingleBot(bot, apiKey) {
  try {
    const existing = botMemory.getMemory(bot.id);
    const existingTopics = existing.map(e => e.content);

    console.log(`  🔍 [BotLearning] ${bot.name} is researching...`);
    botLog(bot.name, 'LEARNING_START', `Has ${existingTopics.length} existing memories`);
    broadcast({ type: 'bot_learning_phase', botId: bot.id, phase: 'researching' });

    const learningModel = store.settings?.learningModel;
    const model = (typeof learningModel === 'string' && learningModel.trim()) ? learningModel.trim() : getModelForBot(bot.id);
    const localBaseUrl = store.settings?.localBaseUrl || DEFAULT_LOCAL_BASE_URL;
    const tavilyApiKey = store.settings?.tavilyApiKey || '';
    const lang = store.settings?.language || 'de';

    const results = await generateBotLearning({ bot, apiKey, model, existingTopics, localBaseUrl, tavilyApiKey, lang });

    let count = 0;
    for (const entry of results) {
      botMemory.addMemoryEntry(bot.id, entry);
      count++;
      console.log(`  ✅ [BotLearning] ${bot.name} learned: "${entry.content.slice(0, 80)}"`);
      botLog(bot.name, 'LEARNING_SUCCESS', `Fact: ${entry.content.slice(0, 120)} | Source: ${entry.source || 'none'}`);
    }

    broadcast({ type: 'bot_learning_phase', botId: bot.id, phase: 'learned' });
    broadcast({ type: 'bot_learned', botId: bot.id, botName: bot.name, count });

    // Memory konsolidieren ab 30+ Einträgen
    const allEntries = botMemory.getMemory(bot.id);
    if (allEntries.length >= 30) {
      console.log(`  🧠 [BotLearning] ${bot.name} consolidating ${allEntries.length} entries...`);
      botLog(bot.name, 'CONSOLIDATE_START', `${allEntries.length} entries`);
      broadcast({ type: 'bot_learning_phase', botId: bot.id, phase: 'consolidating' });
      try {
        const consModel = (typeof learningModel === 'string' && learningModel.trim()) ? learningModel.trim() : getModelForBot(bot.id);
        const consolidated = await consolidateBotMemory({ bot, entries: allEntries, apiKey, model: consModel, localBaseUrl, tavilyApiKey, lang });
        if (consolidated?.length > 0 && consolidated.length < allEntries.length) {
          botMemory.replaceMemory(bot.id, consolidated);
          console.log(`  🧠 [BotLearning] ${bot.name} consolidated: ${allEntries.length} → ${consolidated.length} entries`);
          botLog(bot.name, 'CONSOLIDATE_SUCCESS', `${allEntries.length} → ${consolidated.length} entries`);
          broadcast({ type: 'bot_learned', botId: bot.id, botName: bot.name, count: 0 });
        }
      } catch (err) {
        console.error(`  ❌ [BotLearning] ${bot.name} consolidation failed:`, err.message);
        botLog(bot.name, 'CONSOLIDATE_ERROR', err.message);
      }
    }

    // Generate/update bot opinion based on all knowledge
    try {
      const currentBot = database.getBot(bot.id) || bot;
      const currentMemories = botMemory.getMemory(bot.id);
      if (currentMemories.length > 0) {
        broadcast({ type: 'bot_learning_phase', botId: bot.id, phase: 'forming_opinion' });
        const opinionModel = (typeof learningModel === 'string' && learningModel.trim()) ? learningModel.trim() : getModelForBot(bot.id);
        const opinion = await generateBotOpinion({ bot: currentBot, memories: currentMemories, apiKey, model: opinionModel, localBaseUrl, lang });
        if (opinion) {
          database.updateBot(bot.id, { opinion });
          console.log(`  💭 [BotLearning] ${bot.name} formed opinion: "${opinion.slice(0, 80)}..."`);
          botLog(bot.name, 'OPINION_UPDATED', opinion.slice(0, 200));
          broadcast({ type: 'bot_learning_phase', botId: bot.id, phase: 'done' });
          broadcast({ type: 'bots_updated', bots: database.getAllBots() });
        }
      }
    } catch (err) {
      console.error(`  ❌ [BotLearning] ${bot.name} opinion generation failed:`, err.message);
      botLog(bot.name, 'OPINION_ERROR', err.message);
    }

    return results;
  } catch (err) {
    console.error(`  ❌ [BotLearning] ${bot.name} failed:`, err.message);
    botLog(bot.name, 'LEARNING_ERROR', err.message);
    return null;
  }
}

// ─── Learning Round (3-5 zufällige Bots) ──────────────────────────────────────

async function runBotLearningRound() {
  if (learningRunning) {
    console.log('[BotLearning] ⏭️  Skipping — previous round still running');
    return;
  }
  if (store.settings?.learningModel === 'disabled') {
    console.log('[BotLearning] ⏸️  Learning disabled in settings, skipping');
    return;
  }

  const apiKey = store.settings?.apiKey;
  learningRunning = true;

  const activeBots = getActiveDbBots().filter(b => !b.isModerator && !b.isJudge && !b.isPollmaster);

  // Prüfen ob Learning möglich ist
  const learningModel = store.settings?.learningModel;
  const hasLocalLearning = typeof learningModel === 'string' && /^(ollama|lmstudio):/i.test(learningModel);
  const hasLocalBots = activeBots.some(b => /^(ollama|lmstudio):/i.test(getModelForBot(b.id)));
  if (!apiKey && !hasLocalLearning && !hasLocalBots) {
    console.log('[BotLearning] ⚠️  No API key and no local models, skipping');
    learningRunning = false;
    return;
  }

  const shuffled = [...activeBots].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, Math.min(5, Math.max(3, Math.floor(activeBots.length / 4))));

  console.log(`\n📚 [BotLearning] Starting round — ${batch.length} bots: ${batch.map(b => b.name).join(', ')}`);
  botLog('SYSTEM', 'LEARNING_ROUND_START', `${batch.length} bots selected`);

  for (const bot of batch) {
    await learnSingleBot(bot, apiKey);
    await sleep(5000);
  }

  learningRunning = false;
  console.log(`📚 [BotLearning] Round complete.\n`);
  botLog('SYSTEM', 'LEARNING_ROUND_END', `${batch.length} bots processed`);
}

// ─── Timer Management ─────────────────────────────────────────────────────────

function getLearningIntervalMs() {
  return (store.settings?.learningInterval || 15) * 60 * 1000;
}

function scheduleLearningRound() {
  if (learningTimerId) clearTimeout(learningTimerId);
  const ms = getLearningIntervalMs();
  learningTimerId = setTimeout(() => {
    runBotLearningRound()
      .catch(err => console.error('[BotLearning] Round error:', err.message))
      .finally(() => scheduleLearningRound());
  }, ms);
  console.log(`📚 [BotLearning] Next round in ${ms / 60000} min`);
}

function restartLearningCycle() {
  if (learningTimerId) {
    clearTimeout(learningTimerId);
    learningTimerId = null;
  }
  if (store.settings?.learningModel === 'disabled') {
    console.log('📚 [BotLearning] Cycle disabled by settings');
    return;
  }
  const ms = getLearningIntervalMs();
  console.log(`📚 [BotLearning] Cycle restarted — interval ${ms / 60000} min`);
  scheduleLearningRound();
}

function startBotLearningCycle() {
  learningTimerId = setTimeout(() => {
    runBotLearningRound()
      .catch(err => console.error('[BotLearning] Round error:', err.message))
      .finally(() => scheduleLearningRound());
  }, 30_000);
  console.log(`📚 [BotLearning] Cycle started — interval ${store.settings?.learningInterval || 15} min (first round in 30s)`);
}

module.exports = {
  learnSingleBot,
  runBotLearningRound,
  restartLearningCycle,
  startBotLearningCycle,
};
