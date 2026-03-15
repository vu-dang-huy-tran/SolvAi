import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Settings, Plus, ChevronRight, ChevronLeft, AlertCircle, Search, MessageSquare, Lightbulb, Clock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import ThreadList from './components/ThreadList';
import ThreadView from './components/ThreadView';
import ProblemForm from './components/ProblemForm';
import SettingsPanel from './components/SettingsPanel';
import Header from './components/Header';
import ConfirmModal from './components/ConfirmModal';
import BotStatsPanel from './components/BotStatsPanel';
import BotLogPanel from './components/BotLogPanel';
import { setLiveBots, getLiveBots } from './data/bots';
import { getT, DEFAULT_LANG, getLanguageLabel } from './data/lang';

const API = 'http://localhost:3001';
const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_LOCAL_BASE_URL = 'http://localhost:1234';

function sanitizeModelId(model, fallback = DEFAULT_MODEL) {
  if (typeof model !== 'string') return fallback;
  const trimmed = model.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
}

function sanitizeCustomModels(models) {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const model of models) {
    if (typeof model !== 'string') continue;
    const trimmed = model.trim();
    if (!trimmed || trimmed.length > 120 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
}

// ── API Keys: stored only in browser localStorage ─────────────────────────────
export function getApiKeys() {
  try {
    const raw = localStorage.getItem('solvai-api-keys');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        tavilyApiKey: typeof parsed.tavilyApiKey === 'string' ? parsed.tavilyApiKey : '',
      };
    }
  } catch (_) {}
  return { apiKey: '', tavilyApiKey: '' };
}

export function setApiKeys(apiKey, tavilyApiKey) {
  localStorage.setItem('solvai-api-keys', JSON.stringify({ apiKey, tavilyApiKey }));
}

function normalizeSettings(raw = {}) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const model = sanitizeModelId(base.model, DEFAULT_MODEL);
  const customModels = sanitizeCustomModels(base.customModels);
  const interval = Number.isFinite(Number(base.interval))
    ? Math.min(60000, Math.max(1000, Math.round(Number(base.interval))))
    : 10000;
  const localBaseUrl = typeof base.localBaseUrl === 'string' && base.localBaseUrl.trim()
    ? base.localBaseUrl.trim().replace(/\/+$/, '')
    : DEFAULT_LOCAL_BASE_URL;
  // Trust botModels from the server — DB is the single source of truth
  const inputBotModels = base.botModels && typeof base.botModels === 'object' ? base.botModels : {};
  const botModels = {};
  for (const [botId, m] of Object.entries(inputBotModels)) {
    if (typeof m === 'string' && m.trim()) {
      botModels[botId] = m.trim().slice(0, 120);
    }
  }
  // Fill in defaults for any bots loaded from DB that aren't in botModels yet
  for (const bot of getLiveBots()) {
    if (!(bot.id in botModels)) {
      botModels[bot.id] = model;
    }
  }

  return {
    interval,
    botCount: 6,
    localBaseUrl,
    model,
    customModels,
    botModels,
    botIntervals: base.botIntervals && typeof base.botIntervals === 'object' ? base.botIntervals : {},
    botPrompts: base.botPrompts && typeof base.botPrompts === 'object' ? base.botPrompts : {},
    botOverrides: base.botOverrides && typeof base.botOverrides === 'object' ? base.botOverrides : {},
    learningEnabled: typeof base.learningEnabled === 'boolean' ? base.learningEnabled : true,
    learningInterval: Number.isFinite(Number(base.learningInterval)) ? Math.min(120, Math.max(1, Math.round(Number(base.learningInterval)))) : 15,
    learningModel: typeof base.learningModel === 'string' ? base.learningModel : '',
    probabilityModel: typeof base.probabilityModel === 'string' ? base.probabilityModel : '',
    embeddingProvider: base.embeddingProvider === 'local' ? 'local' : 'cloud',
    localEmbeddingModel: typeof base.localEmbeddingModel === 'string' ? base.localEmbeddingModel : '',
    verdictInterval: Number.isFinite(Number(base.verdictInterval)) && Number(base.verdictInterval) >= 10
      ? Math.round(Number(base.verdictInterval) / 10) * 10 : 0,
    language: ['de','en','zh','hi','es','fr','ar','pt'].includes(base.language) ? base.language : DEFAULT_LANG,
  };
}

export default function App() {
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('solvai-settings');
      if (saved) return normalizeSettings(JSON.parse(saved));
    } catch (_) {}
    return normalizeSettings();
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('solvai-sidebar') !== 'false'; } catch (_) { return true; }
  });
  useEffect(() => { localStorage.setItem('solvai-sidebar', sidebarOpen); }, [sidebarOpen]);

  const t = getT(settings.language);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translatingLang, setTranslatingLang] = useState(null);
  const [translatingProgress, setTranslatingProgress] = useState(null);
  const [botLearnedEvent, setBotLearnedEvent] = useState(null);
  const [botLearningPhase, setBotLearningPhase] = useState(null);
  const [botsVersion, setBotsVersion] = useState(0);
  const esRef = useRef(null);

  // ── Theme (light/dark) with localStorage ────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('solvai-theme') || 'dark';
    } catch (_) { return 'dark'; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('solvai-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // ── Persist settings to localStorage ────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('solvai-settings', JSON.stringify(settings));
  }, [settings]);

  // Bots are loaded via SSE init event (includes bots from DB).
  // No separate fetch needed — SSE init is the single source of truth.

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    function connect() {
      const es = new EventSource(`${API}/api/events`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        handleSSEEvent(event);
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, []);

  const handleSSEEvent = useCallback((event) => {
    switch (event.type) {
      case 'init':
        if (Array.isArray(event.bots)) setLiveBots(event.bots);
        setThreads(event.threads || []);
        if (event.settings) setSettings(normalizeSettings(event.settings));
        break;

      case 'thread_created':
        setThreads(prev => [event.thread, ...prev]);
        setSelectedId(event.thread.id);
        setShowForm(false);
        break;

      case 'bot_typing':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId
            ? { ...t, typing: event.botId, typingTask: event.task, researchStatus: null }
            : t
        ));
        break;

      case 'research_progress':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId ? { ...t, researchStatus: event.status } : t
        ));
        break;

      case 'comment_upvoted':
        setThreads(prev => prev.map(t => {
          if (t.id !== event.threadId) return t;
          return {
            ...t,
            comments: (t.comments || []).map(c =>
              c.id === event.commentId ? { ...c, upvotes: event.upvotes } : c
            ),
          };
        }));
        break;

      case 'comment_added':
      case 'solution_proposed':
        setThreads(prev => prev.map(t => {
          if (t.id !== event.threadId) return t;
          const updated = { ...t, typing: null };
          if (event.comment) {
            updated.comments = [...(t.comments || []), event.comment];
          }
          if (event.solutions) {
            updated.solutions = event.solutions;
          } else if (event.solution) {
            updated.solutions = [...(t.solutions || []), event.solution]
              .sort((a, b) => b.votes - a.votes)
              .map((s, i) => ({ ...s, rank: i + 1 }));
          }
          return updated;
        }));
        break;

      case 'thread_status':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId ? { ...t, status: event.status } : t
        ));
        break;

      case 'thread_resolved':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId
            ? { ...t, status: 'resolved', typing: null, solutions: event.solutions || t.solutions }
            : t
        ));
        break;

      case 'solutions_updated':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId ? { ...t, solutions: event.solutions } : t
        ));
        break;

      case 'poll_created':
      case 'poll_vote':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId ? { ...t, polls: event.polls } : t
        ));
        break;

      case 'settings_updated':
        setSettings(normalizeSettings(event.settings));
        break;

      case 'bots_updated':
        if (Array.isArray(event.bots)) setLiveBots(event.bots);
        setBotsVersion(v => v + 1);
        break;

      case 'bot_translating':
        setTranslatingProgress({ botName: event.botName, current: event.current, total: event.total });
        break;

      case 'bot_learned':
        setBotLearnedEvent({ botId: event.botId, ts: Date.now() });
        break;

      case 'bot_learning_phase':
        if (event.phase === 'done') {
          setBotLearningPhase(null);
        } else {
          setBotLearningPhase({ botId: event.botId, phase: event.phase });
        }
        break;

      case 'bot_error':
        setThreads(prev => prev.map(t =>
          t.id === event.threadId ? { ...t, typing: null } : t
        ));
        if (event.message?.includes('API key')) {
          setError(t('errorApiKey'));
          setShowSettings(true);
        } else if (event.message && /nicht erreichbar|ECONNREFUSED|fetch failed|Timeout|Verbindungsfehler|not reachable|connection/i.test(event.message)) {
          setError(`⚠️ ${t('errorLocalModel')} (${event.message})`);
        }
        break;

      default:
        break;
    }
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function submitProblem(problem, files = []) {
    const formData = new FormData();
    formData.append('problem', problem);
    files.forEach(f => formData.append('files', f));
    const res = await fetch(`${API}/api/threads`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(t('errorCreateThread'));
  }

  async function saveSettings(newSettings) {
    const payload = normalizeSettings(newSettings);
    // Merge API keys from localStorage into payload for backend (keys are not persisted in DB)
    const storedKeys = getApiKeys();
    const payloadWithKeys = { ...payload, apiKey: storedKeys.apiKey, tavilyApiKey: storedKeys.tavilyApiKey };
    const res = await fetch(`${API}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadWithKeys),
    });
    if (!res.ok) throw new Error(t('errorSaveSettings'));
    const saved = normalizeSettings(await res.json());
    const langChanged = saved.language !== settings.language;
    setSettings(saved);
    setShowSettings(false);
    setError(null);
    // Trigger bot translation if language changed
    if (langChanged) {
      const previousLang = settings.language;
      setTranslatingLang(saved.language);
      setTranslating(true);
      try {
        await fetch(`${API}/api/bots/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLang: saved.language, previousLang }),
        });
      } catch (_) {}
      setTranslating(false);
      setTranslatingLang(null);
      setTranslatingProgress(null);
    }
  }

  async function voteOnSolution(threadId, solutionId, direction) {
    await fetch(`${API}/api/threads/${threadId}/solutions/${solutionId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
  }

  async function postUserComment(threadId, message, replyTo = null, files = []) {
    const formData = new FormData();
    formData.append('message', message);
    if (replyTo) formData.append('replyTo', replyTo);
    files.forEach(f => formData.append('files', f));
    await fetch(`${API}/api/threads/${threadId}/comments`, {
      method: 'POST',
      body: formData,
    });
  }

  const selectedThread = threads.find(t => t.id === selectedId) || null;

  // Thread löschen
  async function deleteThread(threadId) {
    setDeleteTarget(threadId);
  }

  async function confirmDelete() {
    const threadId = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`${API}/api/threads/${threadId}`, { method: 'DELETE' });
    if (res.ok) {
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (selectedId === threadId) setSelectedId(null);
    } else {
      setError(t('errorDeleteThread'));
    }
  }

  return (
    <div className="flex flex-col h-screen bg-reddit-bg overflow-hidden">
      <Header
        connected={connected}
        onHome={() => { setSelectedId(null); setShowForm(false); }}
        onNewProblem={() => { setShowForm(true); setSelectedId(null); }}
        onSettings={() => setShowSettings(true)}
        onStats={() => setShowStats(true)}
        onLogs={() => setShowLogs(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        t={t}
      />

      {error && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b text-sm ${
          error.startsWith('⚠️')
            ? 'bg-yellow-900/40 border-yellow-800/50 text-yellow-300'
            : 'bg-red-900/40 border-red-800/50 text-red-300'
        }`}>
          <AlertCircle size={14} />
          {error}
          <button
            onClick={() => setError(null)}
            className={`ml-auto ${error.startsWith('⚠️') ? 'text-yellow-400 hover:text-yellow-200' : 'text-red-400 hover:text-red-200'}`}
          >✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} border-r border-reddit-border flex flex-col overflow-hidden bg-reddit-surface/30 transition-all duration-300 flex-shrink-0`}>
          {/* New Problem Button */}
          <div className="p-3 border-b border-reddit-border min-w-[18rem]">
            <button
              onClick={() => { setShowForm(true); setSelectedId(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-reddit-orange text-white font-semibold text-sm hover:bg-reddit-orange/90 transition-colors"
            >
              <Plus size={16} />
              {t('problemSubmit')}
            </button>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-xs text-reddit-muted uppercase tracking-wider px-2 py-1 mb-1">
              {t('activeThreads')} ({threads.length})
            </p>
            <ThreadList
              threads={threads}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setShowForm(false); }}
              onDelete={deleteThread}
              t={t}
            />
          </div>

          {/* Settings Shortcut */}
          <div className="border-t border-reddit-border p-3">
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-reddit-muted hover:text-reddit-text hover:bg-white/5 text-sm transition-colors"
            >
              <Settings size={14} />
              {t('settings')}
            </button>
          </div>
        </aside>

        {/* ── Sidebar Toggle ── */}
        <button
          onClick={() => setSidebarOpen(s => !s)}
          className="flex-shrink-0 flex items-center justify-center w-6 border-r border-reddit-border bg-reddit-surface/30 text-reddit-muted hover:text-reddit-text hover:bg-white/5 transition-colors"
          title={sidebarOpen ? 'Sidebar schließen' : 'Sidebar öffnen'}
        >
          {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {showForm ? (
            <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
              <ProblemForm onSubmit={submitProblem} onCancel={() => setShowForm(false)} t={t} />
            </div>
          ) : selectedThread ? (
            <ThreadView
              thread={selectedThread}
              onVote={voteOnSolution}
              onUserComment={postUserComment}
              onSelectThread={id => { setSelectedId(id); setShowForm(false); }}
              t={t}
            />
          ) : (
            <EmptyState onNewProblem={() => setShowForm(true)} onSelectThread={id => { setSelectedId(id); setShowForm(false); }} t={t} language={settings.language} />
          )}
        </main>
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={saveSettings}
          apiBase={API}
          onClose={() => setShowSettings(false)}
          t={t}
          botLearnedEvent={botLearnedEvent}
          botLearningPhase={botLearningPhase}
          botsVersion={botsVersion}
        />
      )}

      {/* ── Bot Stats Modal ── */}
      {showStats && (
        <BotStatsPanel onClose={() => setShowStats(false)} t={t} />
      )}

      {/* ── Bot Log Modal ── */}
      {showLogs && (
        <BotLogPanel onClose={() => setShowLogs(false)} t={t} />
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <ConfirmModal
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          t={t}
        />
      )}

      {/* ── Translation Modal ── */}
      {translating && <TranslatingModal lang={translatingLang} t={t} progress={translatingProgress} />}
    </div>
  );
}

function EmptyState({ onNewProblem, onSelectThread, t, language }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const particles = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i,
    left: `${5 + Math.random() * 90}%`,
    size: 3 + Math.random() * 5,
    duration: 4 + Math.random() * 6,
    delay: Math.random() * 5,
    color: ['#FF4500', '#FF8C00', '#0079D3', '#7C3AED', '#10B981'][i % 5],
  })), []);

  function handleSearch(value) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API}/api/threads/search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) setResults(await res.json());
      } catch (_) {}
      setSearching(false);
    }, 500);
  }

  const statusLabel = { active: t('statusOpen'), discussing: t('statusDiscussing'), resolved: t('statusResolved') };
  const dateLang = language === 'de' ? 'de-DE' : language === 'zh' ? 'zh-CN' : language === 'hi' ? 'hi-IN' : language === 'ar' ? 'ar-SA' : language === 'pt' ? 'pt-BR' : language || 'en';

  return (
    <div className="flex-1 flex flex-col items-center p-8 overflow-y-auto relative">
      {/* Floating particles */}
      {particles.map(p => (
        <span
          key={p.id}
          className="landing-particle"
          style={{
            left: p.left,
            bottom: 0,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: 0.5,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <div className="w-full max-w-2xl relative z-10">
        {/* Hero */}
        <div className="text-center mb-10 mt-10 landing-stagger-1">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 rounded-full bg-reddit-orange/20 landing-pulse-ring" />
            <div className="text-7xl landing-hero-icon select-none">🤖</div>
          </div>
          <h2 className="text-4xl font-extrabold mb-3 landing-title">SolvAI</h2>
          <p className="text-reddit-muted max-w-md mx-auto text-base landing-subtitle landing-stagger-2">
            {t('heroText')}
          </p>
          <p className="text-reddit-muted/60 text-xs mt-3 landing-stagger-2 flex items-center justify-center gap-1.5">
            <span>🔒</span> {t('localNotice')}
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6 landing-stagger-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-reddit-muted" />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-10 pr-4 py-3 bg-reddit-surface border border-reddit-border rounded-xl text-sm text-reddit-text placeholder-reddit-muted focus:outline-none focus:border-reddit-orange/60 focus:ring-2 focus:ring-reddit-orange/20 transition-all duration-300"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-reddit-muted/30 border-t-reddit-orange rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search Results */}
        {results.length > 0 && (
          <div className="flex flex-col gap-2 mb-6">
            <p className="text-xs text-reddit-muted uppercase tracking-wider px-1">
              {results.length} {results.length !== 1 ? t('searchResultsPlural') : t('searchResults')}
            </p>
            {results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => onSelectThread(r.id)}
                className="w-full text-left p-4 rounded-xl bg-reddit-surface border border-reddit-border hover:border-reddit-orange/40 transition-all group"
                style={{ animation: `staggerUp 0.4s ease-out both`, animationDelay: `${i * 0.08}s` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-reddit-text group-hover:text-reddit-orange transition-colors line-clamp-2">
                      {r.problem}
                    </p>
                    {r.topSolution && (
                      <p className="text-xs text-reddit-muted mt-1.5 line-clamp-1">
                        <Lightbulb size={10} className="inline mr-1 text-yellow-500" />
                        {r.topSolution}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-reddit-muted">
                      <span>{statusLabel[r.status] || r.status}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare size={9} /> {r.commentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Lightbulb size={9} /> {r.solutionCount}
                      </span>
                      {r.createdAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={9} /> {new Date(r.createdAt).toLocaleDateString(dateLang)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-reddit-muted group-hover:text-reddit-orange flex-shrink-0 mt-1 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <div className="text-center py-6 text-reddit-muted text-sm">
            <div className="text-2xl mb-2">🔍</div>
            {t('searchEmpty')} „{query}“
          </div>
        )}

        {/* New Problem CTA */}
        <div className="text-center landing-stagger-5">
          <button
            onClick={onNewProblem}
            className="landing-cta-btn inline-flex items-center gap-2 px-8 py-3.5 bg-reddit-orange text-white rounded-xl font-bold text-base hover:bg-reddit-orange/90 transition-all duration-200"
          >
            <Plus size={18} />
            {query.trim() ? t('newProblem') : t('firstProblem')}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <footer className="mt-auto pb-4 pt-6 text-center text-xs text-reddit-muted relative z-10">
        by <a href="mailto:tran.vu.dang.huy@gmail.com" className="hover:text-reddit-text transition-colors underline">Huy Tran</a>
      </footer>
    </div>
  );
}

function TranslatingModal({ lang, t, progress }) {
  const label = getLanguageLabel(lang);
  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-reddit-surface border border-reddit-border rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center">
        <div className="relative mx-auto w-16 h-16 mb-5">
          <div className="absolute inset-0 rounded-full border-4 border-reddit-border" />
          <div className="absolute inset-0 rounded-full border-4 border-reddit-orange border-t-transparent animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-2xl">🌐</span>
        </div>
        <h3 className="text-lg font-bold text-reddit-text mb-2">{t('translatingBots')}</h3>
        <p className="text-sm text-reddit-muted mb-1">
          {label}
        </p>
        {progress && (
          <>
            <p className="text-sm text-reddit-text font-medium mb-3 truncate">
              {progress.botName} <span className="text-reddit-muted font-normal">({progress.current}/{progress.total})</span>
            </p>
            <div className="w-full bg-reddit-border rounded-full h-2 mb-3 overflow-hidden">
              <div
                className="h-full bg-reddit-orange rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
        {!progress && (
          <div className="flex justify-center gap-1 mt-3">
            {[0, 1, 2, 3, 4].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-reddit-orange"
                style={{
                  animation: 'bounceDot 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
