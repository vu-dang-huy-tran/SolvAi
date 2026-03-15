/**
 * logger.js — Bot-Aktivitäts-Logging auf Datei.
 *
 * Schreibt strukturierte Log-Zeilen in data/bot-activity.log.
 * Format: [ISO-Timestamp] [BotName] ACTION | Details
 */

const fs = require('fs');
const { LOG_DIR, LOG_FILE } = require('./config');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function botLog(botName, action, details = '') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${botName}] ${action}${details ? ' | ' + details : ''}\n`;
  fs.appendFile(LOG_FILE, line, () => {});
}

module.exports = { botLog };
