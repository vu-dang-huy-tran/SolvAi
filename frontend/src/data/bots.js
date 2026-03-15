/**
 * data/bots.js — Frontend Bot-Registry.
 *
 * Bots kommen live aus der DB via SSE (/api/events → init.bots).
 * Dieses Modul verwaltet den lokalen Cache und bietet Lookup-Funktionen.
 */

let _liveBots = [];

export function setLiveBots(bots) {
  if (Array.isArray(bots) && bots.length > 0) _liveBots = bots;
}

export function getLiveBots() {
  return _liveBots;
}

export function getBotById(id) {
  const pool = getLiveBots();
  const base = pool.find(b => b.id === id) || {
    id, name: id, avatar: '🤖', color: '#8B949E', flair: 'Bot', karma: 0,
  };
  try {
    const saved = localStorage.getItem('solvai-settings');
    if (saved) {
      const overrides = JSON.parse(saved)?.botOverrides?.[id];
      if (overrides && typeof overrides === 'object') {
        return { ...base, ...overrides, id: base.id };
      }
    }
  } catch (_) {}
  return base;
}
