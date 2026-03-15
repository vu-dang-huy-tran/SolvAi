import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Scroll } from 'lucide-react';

const API = 'http://localhost:3001';

function colorForAction(action) {
  if (action === 'TYPING') return 'text-blue-400';
  if (action === 'RESPONSE') return 'text-green-400';
  if (action === 'VERDICT') return 'text-yellow-400';
  if (action === 'ERROR') return 'text-red-400';
  return 'text-reddit-muted';
}

function parseLine(line) {
  const match = line.match(/^\[(.+?)\] \[(.+?)\] (\w+)(.*)/);
  if (!match) return { raw: line };
  return { timestamp: match[1], bot: match[2], action: match[3], details: match[4]?.replace(/^ \| /, '') || '' };
}

export default function BotLogPanel({ onClose, t }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef(null);

  function fetchLogs() {
    setLoading(true);
    fetch(`${API}/api/logs/bots`)
      .then(r => r.json())
      .then(data => { setLines(data.lines || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const filtered = filter
    ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-reddit-surface border border-reddit-border rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-reddit-border">
          <div className="flex items-center gap-2">
            <Scroll size={18} className="text-reddit-orange" />
            <h2 className="text-lg font-bold text-reddit-text">{t('botLogTitle')}</h2>
            <span className="text-xs text-reddit-muted bg-reddit-border px-2 py-0.5 rounded-full">{filtered.length} {t('entries')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs} className="p-1.5 text-reddit-muted hover:text-reddit-text hover:bg-white/5 rounded-lg" title="Aktualisieren">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 text-reddit-muted hover:text-reddit-text hover:bg-white/5 rounded-lg">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="px-5 pt-3 pb-2">
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('filterPlaceholder')}
            className="w-full px-3 py-1.5 bg-reddit-bg border border-reddit-border rounded-lg text-sm text-reddit-text placeholder:text-reddit-muted focus:outline-none focus:border-reddit-orange"
          />
        </div>

        {/* Log Lines */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4 font-mono text-xs leading-relaxed">
          {loading && lines.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-reddit-muted">{t('loadingLogs')}</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-reddit-muted">{t('noLogs')}</div>
          ) : (
            filtered.map((line, i) => {
              const p = parseLine(line);
              if (p.raw) return <div key={i} className="text-reddit-muted py-0.5">{p.raw}</div>;
              return (
                <div key={i} className="py-0.5 flex gap-2 hover:bg-white/5 px-1 rounded">
                  <span className="text-reddit-muted shrink-0">{p.timestamp.split('T')[1]?.slice(0, 8) || p.timestamp}</span>
                  <span className="text-reddit-orange font-semibold shrink-0 w-36 truncate">{p.bot}</span>
                  <span className={`font-bold shrink-0 w-20 ${colorForAction(p.action)}`}>{p.action}</span>
                  <span className="text-reddit-text truncate">{p.details}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
