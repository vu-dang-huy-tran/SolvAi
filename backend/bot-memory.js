/**
 * bot-memory.js — Bot-Wissens-Verwaltung (Wrapper um database.js).
 *
 * Jeder Bot hat einen persistenten Wissens-Speicher mit recherchierten Fakten.
 * Format: { topic, content, source, learnedAt }
 *
 * Exportiert: getMemory, addMemoryEntry, getAllMemories, clearMemory, replaceMemory
 */
const database = require('./database');

function getMemory(botId) {
  return database.getBotMemory(botId);
}

function getAllMemories() {
  return database.getAllBotMemories();
}

function addMemoryEntry(botId, entry) {
  database.addBotMemory(botId, entry);
}

function clearMemory(botId) {
  database.clearBotMemory(botId);
}

function replaceMemory(botId, entries) {
  database.replaceBotMemory(botId, entries);
}

module.exports = { getMemory, getAllMemories, addMemoryEntry, clearMemory, replaceMemory };
