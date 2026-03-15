/**
 * config.js — Gemeinsame Konstanten und Pfad-Definitionen.
 *
 * Einzige Quelle für Default-Werte die in mehreren Modulen gebraucht werden.
 * Keine Abhängigkeiten auf andere App-Module.
 */

const path = require('path');

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_LOCAL_BASE_URL = 'http://localhost:1234';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const LOG_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(LOG_DIR, 'bot-activity.log');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const VICTOR_PATROL_INTERVAL = 3 * 60 * 1000; // 3 Minuten

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_OLLAMA_BASE_URL,
  UPLOAD_DIR,
  LOG_DIR,
  LOG_FILE,
  ALLOWED_MIME,
  MAX_FILE_SIZE,
  VICTOR_PATROL_INTERVAL,
};
