import { useState, useEffect } from 'react';
import { X, MessageSquare, Lightbulb, ThumbsUp, Trophy, Medal } from 'lucide-react';

const API = 'http://localhost:3001';

const SORT_KEYS = ['comments', 'solutions', 'likes'];
const SORT_ICONS = { comments: MessageSquare, solutions: Lightbulb, likes: ThumbsUp };
const SORT_LABEL_KEYS = { comments: 'mostComments', solutions: 'mostSolutions', likes: 'mostLikes' };

function RankBadge({ rank }) {
  if (rank === 1) return <Trophy size={18} className="text-yellow-400" />;
  if (rank === 2) return <Medal size={18} className="text-gray-300" />;
  if (rank === 3) return <Medal size={18} className="text-amber-600" />;
  return <span className="text-xs text-reddit-muted w-[18px] text-center">{rank}</span>;
}

export default function BotStatsPanel({ onClose, t }) {
  const [stats, setStats] = useState([]);
  const [sortBy, setSortBy] = useState('comments');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/stats/bots`)
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sorted = [...stats].sort((a, b) => b[sortBy] - a[sortBy]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-reddit-surface border border-reddit-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-reddit-border">
          <div>
            <h2 className="text-lg font-bold text-reddit-text">{t('botStatsTitle')}</h2>
            <p className="text-xs text-reddit-muted mt-0.5">{t('botStatsSubtitle')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-reddit-muted hover:text-reddit-text hover:bg-white/5 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Sort Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-2">
          {SORT_KEYS.map(key => {
            const Icon = SORT_ICONS[key];
            const active = sortBy === key;
            return (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-reddit-orange text-white'
                    : 'text-reddit-muted hover:text-reddit-text hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {t(SORT_LABEL_KEYS[key])}
              </button>
            );
          })}
        </div>

        {/* Stats List */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-reddit-muted">{t('loadingStats')}</div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-reddit-muted">{t('noActivity')}</div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {sorted.map((bot, i) => (
                <div
                  key={bot.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="w-6 flex justify-center">
                    <RankBadge rank={i + 1} />
                  </div>
                  <span className="text-xl">{bot.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: bot.color }}>{bot.name}</span>
                      <span className="text-[10px] text-reddit-muted bg-reddit-border px-1.5 py-0.5 rounded-full truncate">{bot.flair}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className={`flex items-center gap-1 ${sortBy === 'comments' ? 'text-reddit-orange font-bold' : 'text-reddit-muted'}`}>
                      <MessageSquare size={12} />
                      {bot.comments}
                    </div>
                    <div className={`flex items-center gap-1 ${sortBy === 'solutions' ? 'text-reddit-orange font-bold' : 'text-reddit-muted'}`}>
                      <Lightbulb size={12} />
                      {bot.solutions}
                    </div>
                    <div className={`flex items-center gap-1 ${sortBy === 'likes' ? 'text-reddit-orange font-bold' : 'text-reddit-muted'}`}>
                      <ThumbsUp size={12} />
                      {bot.likes}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
