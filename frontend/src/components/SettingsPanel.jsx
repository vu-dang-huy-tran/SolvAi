import { useEffect, useMemo, useState } from 'react';
import { X, Eye, EyeOff, Settings, Plus, Trash2, Power, Pencil } from 'lucide-react';
import { getLiveBots, setLiveBots } from '../data/bots';
import { LANGUAGES } from '../data/lang';
import { getApiKeys, setApiKeys } from '../App';

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_LOCAL_BASE_URL = 'http://localhost:1234';

const BUILTIN_MODELS = [
  { id: DEFAULT_MODEL, label: 'Gemini 3.1 Pro Preview', desc: 'Cloud-Modell von Google' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Cloud-Modell von Google' },
];

function ensureFormSettings(settings) {
  const fallbackModel = typeof settings?.model === 'string' && settings.model.trim()
    ? settings.model.trim()
    : DEFAULT_MODEL;
  const customModels = Array.isArray(settings?.customModels)
    ? [...new Set(
        settings.customModels
          .filter(m => typeof m === 'string' && m.trim())
          .map(m => {
            const t = m.trim();
            // Auto-fix bare model names
            if (!t.startsWith('lmstudio:') && !t.startsWith('ollama:') && !t.startsWith('gemini')) {
              return `lmstudio:${t}`;
            }
            return t;
          })
      )]
    : [];
  const botModels = {};

  // Trust botModels from settings — DB is the single source of truth
  if (settings?.botModels && typeof settings.botModels === 'object') {
    for (const [botId, m] of Object.entries(settings.botModels)) {
      if (typeof m === 'string' && m.trim()) {
        let val = m.trim();
        // Auto-fix bare model names that should have lmstudio: prefix
        if (!val.startsWith('lmstudio:') && !val.startsWith('ollama:') && !val.startsWith('gemini')) {
          val = `lmstudio:${val}`;
        }
        botModels[botId] = val;
      }
    }
  }
  // Fill in defaults for any DB bots not yet in botModels
  const botList = getLiveBots();
  botList.forEach(bot => {
    if (!(bot.id in botModels)) {
      botModels[bot.id] = fallbackModel;
    }
  });

  return {
    ...settings,
    model: fallbackModel,
    localBaseUrl: typeof settings?.localBaseUrl === 'string' && settings.localBaseUrl.trim()
      ? settings.localBaseUrl.trim().replace(/\/+$/, '')
      : DEFAULT_LOCAL_BASE_URL,
    customModels,
    botModels,
    botIntervals: settings?.botIntervals && typeof settings.botIntervals === 'object' ? settings.botIntervals : {},
    botPrompts: settings?.botPrompts && typeof settings.botPrompts === 'object' ? settings.botPrompts : {},
    botOverrides: settings?.botOverrides && typeof settings.botOverrides === 'object' ? settings.botOverrides : {},
    learningEnabled: typeof settings?.learningEnabled === 'boolean' ? settings.learningEnabled : true,
    learningInterval: Number.isFinite(Number(settings?.learningInterval)) ? Math.min(120, Math.max(1, Math.round(Number(settings.learningInterval)))) : 15,
    learningModel: typeof settings?.learningModel === 'string' && settings.learningModel.trim() ? settings.learningModel.trim() : '',
    probabilityModel: typeof settings?.probabilityModel === 'string' && settings.probabilityModel.trim() ? settings.probabilityModel.trim() : '',
    embeddingProvider: settings?.embeddingProvider === 'local' ? 'local' : 'cloud',
    localEmbeddingModel: typeof settings?.localEmbeddingModel === 'string' ? settings.localEmbeddingModel : '',
    verdictInterval: Number.isFinite(Number(settings?.verdictInterval)) && Number(settings?.verdictInterval) >= 10
      ? Math.round(Number(settings.verdictInterval) / 10) * 10 : 0,
    language: settings?.language || 'de',
  };
}

export default function SettingsPanel({ settings, onSave, onClose, apiBase, t, botLearnedEvent, botLearningPhase, botsVersion }) {
  const [form, setForm] = useState(() => {
    const base = ensureFormSettings(settings);
    const keys = getApiKeys();
    return { ...base, apiKey: keys.apiKey, tavilyApiKey: keys.tavilyApiKey };
  });
  const [showKey, setShowKey] = useState(false);
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [editingBot, setEditingBot] = useState(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [newBot, setNewBot] = useState(null);
  const [botDescription, setBotDescription] = useState('');
  const [generatingBot, setGeneratingBot] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [botVersion, setBotVersion] = useState(0);
  const [botMemories, setBotMemories] = useState({});
  const [loadingMemory, setLoadingMemory] = useState(null);
  const [learningBot, setLearningBot] = useState(null);
  const [botSearch, setBotSearch] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Automatisch LM Studio Modelle laden beim Öffnen
  useEffect(() => {
    importLmStudioModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refetch memory when a bot finishes learning
  useEffect(() => {
    if (!botLearnedEvent) return;
    const { botId } = botLearnedEvent;
    if (botMemories[botId] !== undefined) {
      fetchBotMemory(botId);
    }
    if (learningBot === botId) {
      setLearningBot(null);
    }
  }, [botLearnedEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render when bots are updated externally (e.g. opinion formed)
  useEffect(() => {
    if (botsVersion > 0) setBotVersion(v => v + 1);
  }, [botsVersion]);

  const modelOptions = useMemo(() => {
    const options = [];
    const seen = new Set();

    function displayLabel(id) {
      if (id.startsWith('lmstudio:')) {
        let name = id.slice('lmstudio:'.length);
        // Strip namespace prefix (e.g. "nvidia/" from "nvidia/nemotron-3-nano")
        const slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.slice(slash + 1);
        return name;
      }
      if (id.startsWith('ollama:')) return id.slice('ollama:'.length);
      return id;
    }

    function addOption(id, label = displayLabel(id), desc = 'Benutzerdefiniert') {
      if (!id || seen.has(id)) return;
      seen.add(id);
      options.push({ id, label, desc });
    }

    BUILTIN_MODELS.forEach(m => addOption(m.id, m.label, m.desc));
    (form.customModels || []).forEach(m => {
      const prefix = m.startsWith('lmstudio:') ? 'LM Studio' : m.startsWith('ollama:') ? 'Ollama' : 'Lokal';
      addOption(m, displayLabel(m), prefix);
    });
    addOption(form.model, displayLabel(form.model), 'Aktuelles Fallback');
    Object.values(form.botModels || {}).forEach(m => addOption(m, displayLabel(m), 'Bot-Zuweisung'));

    return options;
  }, [form.customModels, form.model, form.botModels]);

  function set(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function setBotModel(botId, model) {
    setForm(prev => ({
      ...prev,
      botModels: { ...(prev.botModels || {}), [botId]: model },
    }));
  }

  function setBotInterval(botId, val) {
    setForm(prev => ({
      ...prev,
      botIntervals: { ...(prev.botIntervals || {}), [botId]: val },
    }));
  }

  function setBotPrompt(botId, val) {
    setForm(prev => ({
      ...prev,
      botPrompts: { ...(prev.botPrompts || {}), [botId]: val },
    }));
  }

  function setBotOverride(botId, field, val) {
    setForm(prev => {
      const current = prev.botOverrides?.[botId] || {};
      const updated = { ...current, [field]: val };
      // Remove empty strings to fall back to defaults
      if (!val) delete updated[field];
      const botOverrides = { ...(prev.botOverrides || {}), [botId]: updated };
      // Clean up empty override objects
      if (Object.keys(updated).length === 0) delete botOverrides[botId];
      return { ...prev, botOverrides };
    });
  }

  async function fetchBotMemory(botId) {
    if (!apiBase) return;
    setLoadingMemory(botId);
    try {
      const res = await fetch(`${apiBase}/api/bots/${botId}/memory`);
      if (res.ok) {
        const entries = await res.json();
        setBotMemories(prev => ({ ...prev, [botId]: entries }));
      }
    } catch (_) {}
    setLoadingMemory(null);
  }

  async function clearBotMemory(botId) {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/bots/${botId}/memory`, { method: 'DELETE' });
      if (res.ok) {
        setBotMemories(prev => ({ ...prev, [botId]: [] }));
      }
    } catch (_) {}
  }

  async function triggerBotLearn(botId) {
    if (!apiBase || learningBot) return;
    setLearningBot(botId);
    try {
      await fetch(`${apiBase}/api/bots/${botId}/learn`, { method: 'POST' });
    } catch (_) {
      setLearningBot(null);
    }
  }

  async function toggleBotActive(botId, active) {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/bots/${botId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        const bots = await (await fetch(`${apiBase}/api/bots`)).json();
        if (Array.isArray(bots)) { setLiveBots(bots); setBotVersion(v => v + 1); }
      }
    } catch (_) {}
  }

  async function deleteBotFromDb(botId) {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/bots/${botId}`, { method: 'DELETE' });
      if (res.ok) {
        const bots = await (await fetch(`${apiBase}/api/bots`)).json();
        if (Array.isArray(bots)) { setLiveBots(bots); setBotVersion(v => v + 1); }
        setDeleteConfirm(null);
        if (editingBot === botId) setEditingBot(null);
      }
    } catch (_) {}
  }

  async function generateBot() {
    if (!apiBase || !botDescription.trim()) return;
    setGeneratingBot(true);
    try {
      const res = await fetch(`${apiBase}/api/bots/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: botDescription.trim() }),
      });
      if (res.ok) {
        const config = await res.json();
        setNewBot(config);
      }
    } catch (_) {}
    setGeneratingBot(false);
  }

  async function addBotToDb() {
    if (!apiBase || !newBot?.name?.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBot),
      });
      if (res.ok) {
        const bots = await (await fetch(`${apiBase}/api/bots`)).json();
        if (Array.isArray(bots)) { setLiveBots(bots); setBotVersion(v => v + 1); }
        setNewBot(null);
        setBotDescription('');
        setShowAddBot(false);
      }
    } catch (_) {}
  }

  async function importLmStudioModels() {
    if (!apiBase) return;
    setLoadingLocal(true);
    try {
      const baseUrl = encodeURIComponent((form.localBaseUrl || DEFAULT_LOCAL_BASE_URL).trim());
      const response = await fetch(`${apiBase}/api/local-models?provider=lmstudio&baseUrl=${baseUrl}`);
      const data = await response.json();
      if (!response.ok) return;

      const models = Array.isArray(data?.models) ? data.models : [];
      if (models.length === 0) return;

      // Build set of valid lmstudio model IDs with prefix
      const validLmStudio = new Set(models.map(m => `lmstudio:${m}`));
      const firstValid = `lmstudio:${models[0]}`;

      setForm(prev => {
        // Keep non-lmstudio models + only lmstudio models that actually exist
        const cleaned = (prev.customModels || []).filter(
          m => !m.startsWith('lmstudio:') || validLmStudio.has(m)
        );
        // Add any new lmstudio models
        const list = new Set(cleaned);
        validLmStudio.forEach(m => list.add(m));
        const newCustomModels = [...list];

        // Fix botModels: replace stale lmstudio assignments with first valid LM Studio model
        const newBotModels = { ...(prev.botModels || {}) };
        for (const [botId, model] of Object.entries(newBotModels)) {
          if (model.startsWith('lmstudio:') && !validLmStudio.has(model)) {
            console.warn(`[Settings] Bot ${botId}: Modell "${model}" nicht in LM Studio geladen, setze auf "${firstValid}".`);
            newBotModels[botId] = firstValid;
          }
        }

        return { ...prev, customModels: newCustomModels, botModels: newBotModels };
      });
    } catch (_) {
      // LM Studio nicht erreichbar — still ignorieren
    } finally {
      setLoadingLocal(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-reddit-surface border border-reddit-border rounded-2xl w-full max-w-6xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-reddit-border">
          <Settings size={18} className="text-reddit-muted" />
          <h2 className="font-bold text-reddit-text">{t('settingsTitle')}</h2>
          <button onClick={onClose} className="ml-auto text-reddit-muted hover:text-reddit-text p-1 rounded hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">{t('language')}</label>
            <p className="text-xs text-reddit-muted">{t('languageHint')}</p>
            <div className="grid grid-cols-4 gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => set('language', lang.code)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                    form.language === lang.code
                      ? 'bg-reddit-orange/15 border-reddit-orange text-reddit-orange'
                      : 'bg-reddit-bg border-reddit-border text-reddit-muted hover:text-reddit-text hover:border-reddit-muted'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span className="truncate">{lang.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-sm font-semibold text-reddit-text mb-1">
              {t('googleApiKey')}
            </label>
            <p className="text-xs text-reddit-muted mb-2">
              {t('googleApiKeyHint')} <span className="text-blue-400">aistudio.google.com</span>
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey || ''}
                onChange={e => set('apiKey', e.target.value)}
                placeholder="AIza..."
                className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2.5 pr-10 text-sm text-reddit-text placeholder-reddit-muted focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-reddit-muted hover:text-reddit-text"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {!form.apiKey && (
              <p className="text-xs text-yellow-500 mt-1.5 flex items-center gap-1">
                {t('googleApiKeyWarning')}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">
              {t('tavilyApiKey')}
            </label>
            <p className="text-xs text-reddit-muted">
              {t('tavilyApiKeyHint')}
            </p>
            <div className="relative">
              <input
                type={showTavilyKey ? 'text' : 'password'}
                value={form.tavilyApiKey || ''}
                onChange={e => set('tavilyApiKey', e.target.value)}
                placeholder="tvly-..."
                className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2.5 pr-10 text-sm text-reddit-text placeholder-reddit-muted focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowTavilyKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-reddit-muted hover:text-reddit-text"
              >
                {showTavilyKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">
              {t('semanticSearch')}
            </label>
            <p className="text-xs text-reddit-muted">
              {t('semanticSearchHint')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('embeddingProvider', 'cloud')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.embeddingProvider === 'cloud'
                    ? 'bg-reddit-orange/15 border-reddit-orange text-reddit-orange'
                    : 'bg-reddit-bg border-reddit-border text-reddit-muted hover:text-reddit-text hover:border-reddit-muted'
                }`}
              >
                ☁️ Cloud (Gemini)
              </button>
              <button
                type="button"
                onClick={() => set('embeddingProvider', 'local')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.embeddingProvider === 'local'
                    ? 'bg-reddit-orange/15 border-reddit-orange text-reddit-orange'
                    : 'bg-reddit-bg border-reddit-border text-reddit-muted hover:text-reddit-text hover:border-reddit-muted'
                }`}
              >
                🖥️ Lokal (LM Studio)
              </button>
            </div>
            {form.embeddingProvider === 'local' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-reddit-muted">{t('embeddingModel')}</label>
                <select
                  value={form.localEmbeddingModel || ''}
                  onChange={e => set('localEmbeddingModel', e.target.value)}
                  className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2.5 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
                >
                  <option value="">{t('serverDefault')}</option>
                  {(form.customModels || []).filter(m => m.startsWith('lmstudio:')).map(m => {
                    const name = m.slice('lmstudio:'.length);
                    const short = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
                    return <option key={m} value={name}>{short}</option>;
                  })}
                </select>
                <p className="text-xs text-yellow-500 flex items-center gap-1">
                  {t('embeddingLocalWarning')}
                </p>
              </div>
            )}
            {form.embeddingProvider === 'cloud' && !form.apiKey && (
              <p className="text-xs text-yellow-500 flex items-center gap-1">
                {t('embeddingCloudWarning')}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">
              {t('fallbackModel')}
            </label>
            <p className="text-xs text-reddit-muted">
              {t('fallbackModelHint')}
            </p>
            <select
              value={form.model}
              onChange={e => set('model', e.target.value)}
              className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2.5 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
            >
              {modelOptions.map(model => (
                <option key={model.id} value={model.id}>
                  {model.label} ({model.desc})
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">
              {t('lmStudioUrl')}
            </label>
            <p className="text-xs text-reddit-muted">
              {t('lmStudioUrlHint')}{loadingLocal ? ' …' : (form.customModels || []).length > 0 ? ` (${form.customModels.length} ${t('loaded')})` : ''}.
            </p>
            <input
              value={form.localBaseUrl || DEFAULT_LOCAL_BASE_URL}
              onChange={e => set('localBaseUrl', e.target.value)}
              placeholder={DEFAULT_LOCAL_BASE_URL}
              className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2.5 text-sm text-reddit-text placeholder-reddit-muted focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
            />
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">{t('botAssignment')}</label>
            <p className="text-xs text-reddit-muted">
              {t('botAssignmentHint')}
            </p>
            <div className="flex items-center gap-3">
              <label className="text-xs text-reddit-muted whitespace-nowrap">{t('model')}:</label>
              <select
                value={form.probabilityModel || ''}
                onChange={e => set('probabilityModel', e.target.value)}
                className="flex-1 bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
              >
                <option value="">Gemini Flash (Standard)</option>
                {modelOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">{t('verdictInterval')}</label>
            <p className="text-xs text-reddit-muted">
              {t('verdictIntervalHint')}
            </p>
            <div className="flex items-center gap-3">
              <label className="text-xs text-reddit-muted whitespace-nowrap">{t('interval')}:</label>
              <select
                value={form.verdictInterval || 0}
                onChange={e => set('verdictInterval', Number(e.target.value))}
                className="flex-1 bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
              >
                <option value={0}>{t('verdictAuto')}</option>
                <option value={10}>{t('verdictEvery')} 10 {t('verdictPosts')}</option>
                <option value={20}>{t('verdictEvery')} 20 {t('verdictPosts')}</option>
                <option value={30}>{t('verdictEvery')} 30 {t('verdictPosts')}</option>
                <option value={40}>{t('verdictEvery')} 40 {t('verdictPosts')}</option>
                <option value={50}>{t('verdictEvery')} 50 {t('verdictPosts')}</option>
              </select>
            </div>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">{t('autoLearn')}</label>
            <p className="text-xs text-reddit-muted">
              {t('autoLearnHint')}
            </p>
            <div className="flex items-center gap-3">
              <label className="text-xs text-reddit-muted whitespace-nowrap">{t('model')}:</label>
              <select
                value={form.learningModel || ''}
                onChange={e => set('learningModel', e.target.value)}
                className="flex-1 bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
              >
                <option value="">{t('useBotModel')}</option>
                <option value="disabled">{t('disabled')}</option>
                {modelOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            {form.learningModel !== 'disabled' && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-reddit-muted whitespace-nowrap">{t('interval')}:</label>
                <input
                  type="range"
                  min={1}
                  max={120}
                  step={1}
                  value={form.learningInterval || 15}
                  onChange={e => set('learningInterval', Number(e.target.value))}
                  className="flex-1 accent-reddit-orange"
                />
                <span className="text-xs text-reddit-text w-14 text-right">{form.learningInterval || 15} {t('minutes')}</span>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-semibold text-reddit-text">
                  {t('botConfig')}
                </label>
                <p className="text-xs text-reddit-muted">
                  {t('botConfigHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBot(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-reddit-orange/10 text-reddit-orange hover:bg-reddit-orange/20 border border-reddit-orange/30"
              >
                <Plus size={14} />
                {t('addBot')}
              </button>
            </div>

            {showAddBot && (
              <div className="border border-reddit-orange/40 rounded-lg p-3 bg-reddit-orange/5 space-y-3">
                <p className="text-xs font-semibold text-reddit-orange">{t('createBotWithAi')}</p>

                {/* Step 1: Describe */}
                <div>
                  <label className="block text-[10px] text-reddit-muted mb-1">{t('describeBotLabel')}</label>
                  <textarea
                    value={botDescription}
                    onChange={e => setBotDescription(e.target.value)}
                    placeholder={t('describeBotPlaceholder')}
                    rows={3}
                    className="w-full bg-reddit-bg border border-reddit-border rounded px-2 py-1.5 text-xs text-reddit-text placeholder-reddit-muted resize-y focus:outline-none focus:border-reddit-orange/60"
                  />
                  <button
                    type="button"
                    onClick={generateBot}
                    disabled={!botDescription.trim() || generatingBot}
                    className="mt-1.5 px-3 py-1.5 rounded text-xs font-medium bg-reddit-orange text-white hover:bg-reddit-orange/80 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {generatingBot ? (
                      <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('generating')}</>
                    ) : (
                      <>{t('generateWithAi')}</>
                    )}
                  </button>
                </div>

                {/* Step 2: Preview & Edit */}
                {newBot && (
                  <div className="border-t border-reddit-border/50 pt-3 space-y-2">
                    <p className="text-[10px] text-reddit-muted">{t('previewHint')}</p>
                    <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
                      <div>
                        <label className="block text-[10px] text-reddit-muted mb-0.5">{t('avatar')}</label>
                        <input value={newBot.avatar} onChange={e => setNewBot(p => ({ ...p, avatar: e.target.value }))} className="w-14 bg-reddit-bg border border-reddit-border rounded px-2 py-1 text-sm text-center text-reddit-text" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-reddit-muted mb-0.5">{t('name')}</label>
                        <input value={newBot.name} onChange={e => setNewBot(p => ({ ...p, name: e.target.value }))} className="w-full bg-reddit-bg border border-reddit-border rounded px-2 py-1 text-sm text-reddit-text" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-reddit-muted mb-0.5">{t('flair')}</label>
                        <input value={newBot.flair} onChange={e => setNewBot(p => ({ ...p, flair: e.target.value }))} className="w-full bg-reddit-bg border border-reddit-border rounded px-2 py-1 text-sm text-reddit-text" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-reddit-muted">{t('color')}</label>
                      <input type="color" value={newBot.color} onChange={e => setNewBot(p => ({ ...p, color: e.target.value }))} className="w-7 h-7 rounded border border-reddit-border cursor-pointer bg-transparent" />
                      <span className="text-xs font-mono text-reddit-muted">{newBot.color}</span>
                    </div>
                    <div>
                      <label className="block text-[10px] text-reddit-muted mb-0.5">{t('personality')}</label>
                      <textarea value={newBot.personality} onChange={e => setNewBot(p => ({ ...p, personality: e.target.value }))} rows={3} className="w-full bg-reddit-bg border border-reddit-border rounded px-2 py-1 text-xs text-reddit-text resize-y" />
                    </div>
                    <div className="flex items-center gap-3 p-2 rounded bg-reddit-bg/50 border border-reddit-border/50">
                      <span className="text-2xl">{newBot.avatar}</span>
                      <div>
                        <span className="text-sm font-medium" style={{ color: newBot.color }}>{newBot.name}</span>
                        <span className="ml-2 text-[10px] text-reddit-muted px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{newBot.flair}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => { setShowAddBot(false); setNewBot(null); setBotDescription(''); }} className="px-3 py-1 rounded text-xs text-reddit-muted hover:text-reddit-text hover:bg-white/5">{t('cancel')}</button>
                  {newBot && (
                    <button type="button" onClick={addBotToDb} className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-500">{t('createBot')}</button>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <input
                type="text"
                value={botSearch}
                onChange={e => setBotSearch(e.target.value)}
                placeholder={t('searchBot')}
                className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text placeholder-reddit-muted focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
              />
              {getLiveBots().filter(bot => {
                if (!botSearch.trim()) return true;
                const q = botSearch.toLowerCase();
                const o = form.botOverrides?.[bot.id] || {};
                return (o.name || bot.name).toLowerCase().includes(q)
                  || (o.flair || bot.flair || '').toLowerCase().includes(q)
                  || bot.id.toLowerCase().includes(q);
              }).map(bot => {
                const isActive = bot.active !== false;
                const overrides = form.botOverrides?.[bot.id] || {};
                const hasCustom = form.botPrompts?.[bot.id] || Object.keys(overrides).length > 0;
                const displayName = overrides.name || bot.name;
                const displayAvatar = overrides.avatar || bot.avatar;
                const displayFlair = overrides.flair || bot.flair;
                return (
                  <div
                    key={bot.id}
                    className={`border rounded-lg p-3 cursor-pointer hover:bg-white/5 transition-colors grid grid-cols-[1fr_240px_auto] gap-3 items-center ${isActive ? 'border-reddit-border bg-reddit-bg/40' : 'border-reddit-border/40 bg-reddit-bg/20 opacity-60'}`}
                    onClick={() => {
                      setEditingBot(bot.id);
                      setShowAvatarPicker(false);
                      if (!botMemories[bot.id]) fetchBotMemory(bot.id);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-reddit-text truncate">
                        <span className="mr-1">{displayAvatar}</span>
                        {displayName}
                        {!isActive && <span className="ml-1 text-[10px] text-red-400">{t('deactivated')}</span>}
                        {hasCustom && <span className="ml-1 text-reddit-orange text-[10px]">●</span>}
                      </p>
                      <p className="text-xs text-reddit-muted truncate">{displayFlair}</p>
                    </div>
                    <select
                      value={form.botModels?.[bot.id] || form.model}
                      onChange={e => { e.stopPropagation(); setBotModel(bot.id, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
                    >
                      {modelOptions.map(model => (
                        <option key={`${bot.id}-${model.id}`} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <Pencil size={14} className="text-reddit-muted" />
                    </div>
                  </div>
                );
              })}

              {/* Bot Edit Modal */}
              {editingBot && (() => {
                const bot = getLiveBots().find(b => b.id === editingBot);
                if (!bot) return null;
                const isActive = bot.active !== false;
                const botPrompt = form.botPrompts?.[bot.id] || '';
                const overrides = form.botOverrides?.[bot.id] || {};
                return (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 animate-fade-in" onClick={() => setEditingBot(null)}>
                    <div className="bg-reddit-surface border border-reddit-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                      {/* Modal Header */}
                      <div className="flex items-center gap-3 px-5 py-4 border-b border-reddit-border">
                        <span className="text-2xl">{overrides.avatar || bot.avatar}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-reddit-text truncate">{overrides.name || bot.name}</p>
                          <p className="text-xs text-reddit-muted truncate">{overrides.flair || bot.flair}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!bot.isJudge && (
                            <button
                              type="button"
                              title={isActive ? t('deactivate') : t('activate')}
                              onClick={() => toggleBotActive(bot.id, !isActive)}
                              className={`p-1.5 rounded hover:bg-white/10 ${isActive ? 'text-green-400' : 'text-red-400'}`}
                            >
                              <Power size={16} />
                            </button>
                          )}
                          {!bot.isJudge && (
                            deleteConfirm === bot.id ? (
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => deleteBotFromDb(bot.id)} className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/40">{t('yes')}</button>
                                <button type="button" onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded text-xs text-reddit-muted hover:text-reddit-text">{t('no')}</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                title={t('deleteBot')}
                                onClick={() => setDeleteConfirm(bot.id)}
                                className="p-1.5 rounded text-reddit-muted hover:text-red-400 hover:bg-white/10"
                              >
                                <Trash2 size={16} />
                              </button>
                            )
                          )}
                        </div>
                        <button onClick={() => { setEditingBot(null); setDeleteConfirm(null); }} className="text-reddit-muted hover:text-reddit-text p-1 rounded hover:bg-white/5">
                          <X size={18} />
                        </button>
                      </div>

                      {/* Modal Body */}
                      <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                        {/* Avatar, Name, Flair */}
                        <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
                          <div className="relative">
                            <label className="block text-xs text-reddit-muted mb-1">{t('avatar')}</label>
                            <button
                              type="button"
                              onClick={() => setShowAvatarPicker(v => !v)}
                              className="w-16 h-9 bg-reddit-bg border border-reddit-border rounded-lg text-xl text-center hover:border-reddit-orange/60 hover:bg-white/5 transition-colors"
                            >
                              {overrides.avatar || bot.avatar}
                            </button>
                            {showAvatarPicker && (
                              <div className="absolute top-full left-0 mt-1 z-10 bg-reddit-surface border border-reddit-border rounded-xl shadow-2xl p-3 w-72">
                                <div className="grid grid-cols-8 gap-1 max-h-52 overflow-y-auto">
                                  {['🔧','🦉','💻','💙','😈','🔬','🌟','📊','😤','🌿','⚖️','🔍','🚫','🧠','🚀','💶','🎨','📈','🤝','🎖️','🗞️','🐱','🐶','🦊','🐻','🐼','🐨','🦁','🐮','🐷','🐸','🐵','🐔','🦄','🐝','🦋','🌍','🌙','☀️','⭐','🔥','💧','❄️','🌈','🎯','💡','🎮','🎲','🎭','🎵','📚','✏️','🖥️','📱','⚡','🛡️','🏆','💎','👑','🎩','🤖','👽','👻','💀','🎃','🧙','🧛','🦸','🧑‍💻','👨‍🔬','👩‍🎨','👨‍🏫','👩‍⚕️','🧑‍🚀','👨‍🍳','🤓','😎','🥸','🧐','😏','🤔','💪','👁️','🫀','❤️','💜','💚','🧡','💛','🩵','🖤','💯','✅','❌','⚠️','🏴‍☠️','🫡','🎪'].map(emoji => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => { setBotOverride(bot.id, 'avatar', emoji); setShowAvatarPicker(false); }}
                                      className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-reddit-orange/20 transition-colors ${
                                        (overrides.avatar || bot.avatar) === emoji ? 'bg-reddit-orange/30 ring-1 ring-reddit-orange' : 'hover:bg-white/10'
                                      }`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-reddit-muted mb-1">{t('name')}</label>
                            <input
                              value={overrides.name || bot.name}
                              onChange={e => setBotOverride(bot.id, 'name', e.target.value)}
                              className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-2 py-1.5 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-reddit-muted mb-1">{t('flair')}</label>
                            <input
                              value={overrides.flair || bot.flair}
                              onChange={e => setBotOverride(bot.id, 'flair', e.target.value)}
                              className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-2 py-1.5 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60"
                            />
                          </div>
                        </div>

                        {/* Color */}
                        <div>
                          <label className="block text-xs text-reddit-muted mb-1">{t('color')}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={overrides.color || bot.color}
                              onChange={e => setBotOverride(bot.id, 'color', e.target.value === bot.color ? '' : e.target.value)}
                              className="w-8 h-8 rounded border border-reddit-border cursor-pointer bg-transparent"
                            />
                            <span className="text-xs font-mono text-reddit-muted">{overrides.color || bot.color}</span>
                          </div>
                        </div>

                        {/* Model */}
                        <div>
                          <label className="block text-xs text-reddit-muted mb-1">{t('model')}</label>
                          <select
                            value={form.botModels?.[bot.id] || form.model}
                            onChange={e => setBotModel(bot.id, e.target.value)}
                            className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
                          >
                            {modelOptions.map(model => (
                              <option key={`modal-${bot.id}-${model.id}`} value={model.id}>
                                {model.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* System Prompt */}
                        <div>
                          <label className="block text-xs text-reddit-muted mb-1">{t('systemPrompt')}</label>
                          <textarea
                            value={botPrompt || bot.personality || ''}
                            onChange={e => setBotPrompt(bot.id, e.target.value)}
                            rows={4}
                            className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 text-xs text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30 resize-y"
                          />
                          {botPrompt && (
                            <button
                              type="button"
                              onClick={() => setBotPrompt(bot.id, '')}
                              className="text-[10px] text-reddit-muted hover:text-reddit-text mt-1"
                            >
                              {t('resetPrompt')}
                            </button>
                          )}
                        </div>

                        {/* Memory */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs text-reddit-muted">{t('learnedKnowledge')}</label>
                            <div className="flex items-center gap-2">
                              {botMemories[bot.id]?.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => clearBotMemory(bot.id)}
                                  className="text-[10px] text-red-400 hover:text-red-300"
                                >
                                  {t('clearMemory')}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => triggerBotLearn(bot.id)}
                                disabled={!!learningBot}
                                className="text-[10px] text-green-400 hover:text-green-300 disabled:opacity-40"
                              >
                                {learningBot === bot.id ? t('researching2') : t('learnNow')}
                              </button>
                            </div>
                          </div>

                          {/* Learning Phase Animation */}
                          {botLearningPhase?.botId === bot.id && (
                            <div className="learning-phase-card rounded-lg border border-blue-500/20 px-3 py-2.5 mb-2">
                              <div className="flex items-center gap-2.5">
                                <span className="learning-icon text-lg">
                                  {botLearningPhase.phase === 'researching' && '🔍'}
                                  {botLearningPhase.phase === 'learned' && '✅'}
                                  {botLearningPhase.phase === 'consolidating' && '🧠'}
                                  {botLearningPhase.phase === 'forming_opinion' && '💭'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-medium text-blue-300">
                                    {botLearningPhase.phase === 'researching' && t('phaseResearching')}
                                    {botLearningPhase.phase === 'learned' && t('phaseLearned')}
                                    {botLearningPhase.phase === 'consolidating' && t('phaseConsolidating')}
                                    {botLearningPhase.phase === 'forming_opinion' && t('phaseFormingOpinion')}
                                  </p>
                                  <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-700 ease-out"
                                      style={{
                                        width: botLearningPhase.phase === 'researching' ? '30%'
                                          : botLearningPhase.phase === 'learned' ? '50%'
                                          : botLearningPhase.phase === 'consolidating' ? '70%'
                                          : '90%',
                                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
                                      }}
                                    />
                                  </div>
                                </div>
                                <span className="learning-sparkle text-[10px] text-purple-400">✦</span>
                                <span className="learning-sparkle text-[10px] text-blue-400">✦</span>
                                <span className="learning-sparkle text-[10px] text-pink-400">✦</span>
                              </div>
                            </div>
                          )}

                          {!botMemories[bot.id] ? (
                            <p className="text-[10px] text-reddit-muted italic py-2">{t('noMemoryYet')}</p>
                          ) : (
                            <div className="space-y-0 max-h-48 overflow-y-auto font-mono">
                              {botMemories[bot.id].map((m, i) => (
                                <div key={m.id || i} className="flex items-baseline gap-1.5 py-0.5 border-b border-reddit-border/20 last:border-0">
                                  <p className="text-[11px] text-reddit-text flex-1 truncate" title={m.content}>{m.content}</p>
                                  {m.source && (
                                    <a href={m.source} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 hover:underline whitespace-nowrap flex-shrink-0">
                                      ↗
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Opinion */}
                        {(bot.opinion || (botLearningPhase?.botId === bot.id && botLearningPhase.phase === 'forming_opinion')) && (
                          <div>
                            <label className="block text-xs text-reddit-muted mb-1">💭 {t('botOpinion') || 'Meinung'}</label>
                            {botLearningPhase?.botId === bot.id && botLearningPhase.phase === 'forming_opinion' ? (
                              <div className="learning-phase-card rounded-lg border border-purple-500/20 px-3 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="learning-icon text-lg">💭</span>
                                  <div className="flex-1">
                                    <p className="text-[11px] font-medium text-purple-300">{t('phaseFormingOpinion')}</p>
                                    <div className="mt-1.5 flex gap-1">
                                      <span className="typing-dot bg-purple-400/70"></span>
                                      <span className="typing-dot bg-purple-400/50"></span>
                                      <span className="typing-dot bg-purple-400/30"></span>
                                    </div>
                                  </div>
                                  <span className="learning-sparkle text-[10px] text-purple-400">✦</span>
                                  <span className="learning-sparkle text-[10px] text-pink-400">✦</span>
                                  <span className="learning-sparkle text-[10px] text-blue-400">✦</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
                                  <p className="text-[11px] text-reddit-text whitespace-pre-wrap leading-relaxed">{bot.opinion}</p>
                                </div>
                                <p className="text-[9px] text-reddit-muted mt-1 italic">{t('botOpinionNote') || 'Wird automatisch aus dem gelernten Wissen gebildet und iterativ verbessert.'}</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Modal Footer */}
                      <div className="px-5 py-3 border-t border-reddit-border flex justify-end">
                        <button
                          type="button"
                          onClick={() => { setEditingBot(null); setDeleteConfirm(null); }}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-reddit-muted hover:text-reddit-text hover:bg-white/5 border border-reddit-border"
                        >
                          {t('close')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>

          <section className="space-y-3">
            <label className="block text-sm font-semibold text-reddit-text">
              {t('overrideAllModels')}
            </label>
            <p className="text-xs text-reddit-muted">
              {t('overrideAllModelsHint')}
            </p>
            <select
              value=""
              onChange={e => {
                const val = e.target.value;
                if (!val) return;
                const updated = { ...(form.botModels || {}) };
                const allBots = settings?.bots || Object.keys(form.botModels || {});
                for (const botId of (Array.isArray(allBots) ? allBots.map(b => typeof b === 'string' ? b : b.id) : Object.keys(updated))) {
                  updated[botId] = val;
                }
                set('botModels', updated);
              }}
              className="w-full bg-reddit-bg border border-reddit-border rounded-lg px-3 py-2.5 text-sm text-reddit-text focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30"
            >
              <option value="">{t('chooseModel')}</option>
              {modelOptions.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </section>


        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-reddit-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-reddit-border text-reddit-muted hover:text-reddit-text hover:bg-white/5 text-sm font-medium transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => {
              setApiKeys(form.apiKey || '', form.tavilyApiKey || '');
              onSave(ensureFormSettings(form));
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-reddit-orange text-white text-sm font-semibold hover:bg-reddit-orange/90 transition-colors"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
