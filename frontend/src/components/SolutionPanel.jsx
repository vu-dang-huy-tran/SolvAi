import { useState } from 'react';
import { Trophy, ArrowUp, CheckCircle2, Loader2, ThumbsUp, ThumbsDown, BarChart3 } from 'lucide-react';
import { getBotById } from '../data/bots';
import { renderMarkdown } from './Comment';

const RANK_STYLES = [
  { bg: 'bg-yellow-900/30', border: 'border-yellow-600/40', badge: 'bg-yellow-500 text-black', glow: true },
  { bg: 'bg-gray-800/40',   border: 'border-gray-600/40',  badge: 'bg-gray-400 text-black',   glow: false },
  { bg: 'bg-orange-900/20', border: 'border-orange-800/40', badge: 'bg-orange-700 text-white', glow: false },
];

const TYPE_KEYS = { tech: 'technical', org: 'organizational' };
const TYPE_STYLES = {
  tech: { bg: 'bg-cyan-900/30',   text: 'text-cyan-300',   border: 'border-cyan-800/50' },
  org:  { bg: 'bg-indigo-900/30', text: 'text-indigo-300', border: 'border-indigo-800/50' },
};

export default function SolutionPanel({ solutions, threadId, onVote, status, polls = [], t }) {
  const [voting, setVoting] = useState({});

  async function handleVote(solutionId, direction) {
    setVoting(v => ({ ...v, [solutionId]: direction }));
    try {
      await onVote(threadId, solutionId, direction);
    } finally {
      setVoting(v => ({ ...v, [solutionId]: null }));
    }
  }

  const techSolutions = solutions.filter(s => s.type === 'tech' || !s.type);
  const orgSolutions  = solutions.filter(s => s.type === 'org');

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-yellow-400" />
        <h3 className="font-bold text-reddit-text text-sm">{t('solutionsHeader')}</h3>
        {status !== 'resolved' && (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-400">
            <Loader2 size={10} className="animate-spin" />
            Live
          </span>
        )}
        {status === 'resolved' && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-400">
            <CheckCircle2 size={11} />
            Final
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-2 mb-4">
        <span className="flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-900/20 border border-cyan-800/40 px-2 py-0.5 rounded-full">
          {t('technical')}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-indigo-300 bg-indigo-900/20 border border-indigo-800/40 px-2 py-0.5 rounded-full">
          {t('organizational')}
        </span>
      </div>

      {solutions.length === 0 ? (
        <div className="text-center py-8 text-reddit-muted text-xs">
          <div className="text-2xl mb-2">💭</div>
          <p>{t('botsWorkingOnSolutions')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {solutions.map((solution, idx) => {
            const style = RANK_STYLES[idx] || {
              bg: 'bg-reddit-surface/40', border: 'border-reddit-border/40',
              badge: 'bg-reddit-border text-reddit-text', glow: false
            };
            const bot = getBotById(solution.proposedBy);
            const typeStyle = TYPE_STYLES[solution.type] || TYPE_STYLES.tech;
            const typeLabel = t(TYPE_KEYS[solution.type] || TYPE_KEYS.tech);

            return (
              <div
                key={solution.id}
                className={`rounded-xl p-3 border ${style.bg} ${style.border} ${style.glow ? 'solution-top' : ''} animate-fade-in`}
              >
                {/* Top row: rank + type + proposer */}
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${style.badge}`}>
                    {solution.rank}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
                    {typeLabel}
                  </span>
                  <span className="text-[10px] ml-auto" style={{ color: bot.color }}>
                    {bot.avatar} {bot.name}
                  </span>
                </div>

                {idx === 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-bold mb-2">
                    {t('bestSolution')}
                  </div>
                )}

                {/* Solution text */}
                <div className="text-xs text-reddit-text leading-relaxed comment-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(solution.content) }}
                />

                {/* Pro/Contra counts */}
                {(solution.proCount > 0 || solution.contraCount > 0) && (
                  <div className="flex items-center gap-3 mt-2 text-[10px]">
                    <span className="flex items-center gap-1 text-green-400">
                      <ThumbsUp size={10} />
                      {solution.proCount} Pro
                    </span>
                    <span className="flex items-center gap-1 text-red-400">
                      <ThumbsDown size={10} />
                      {solution.contraCount} Contra
                    </span>
                  </div>
                )}

                {/* Vote controls */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-reddit-border/30">
                  <button
                    onClick={() => handleVote(solution.id, 'up')}
                    disabled={!!voting[solution.id]}
                    className="flex items-center gap-1 text-[11px] text-reddit-muted hover:text-green-400 transition-colors disabled:opacity-50"
                  >
                    {voting[solution.id] === 'up'
                      ? <Loader2 size={11} className="animate-spin" />
                      : <ArrowUp size={11} />
                    }
                    <span className="font-medium text-reddit-text">{solution.votes}</span>
                  </button>
                  <button
                    onClick={() => handleVote(solution.id, 'down')}
                    disabled={!!voting[solution.id]}
                    className="flex items-center gap-1 text-[11px] text-reddit-muted hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {voting[solution.id] === 'down'
                      ? <Loader2 size={11} className="animate-spin" />
                      : <ArrowUp size={11} className="rotate-180" />
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Poll Section (pinned at bottom) ── */}
      {polls.map((poll) => (
        <div key={poll.id} className="mt-4 pt-4 border-t border-reddit-border">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-purple-400" />
            <h4 className="font-bold text-reddit-text text-xs">{t('poll')}</h4>
            {(() => {
              const creator = getBotById(poll.createdBy);
              return creator ? (
                <span className="ml-auto text-[10px]" style={{ color: creator.color }}>
                  {creator.avatar} {creator.name}
                </span>
              ) : null;
            })()}
          </div>
          <div className="text-xs text-reddit-text font-medium mb-3 comment-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(poll.question) }}
          />
          <div className="flex flex-col gap-2">
            {poll.options.map((option, idx) => {
              const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
              const pct = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
              const isLeading = totalVotes > 0 && option.votes === Math.max(...poll.options.map(o => o.votes));

              return (
                <div key={idx} className="relative overflow-hidden rounded-lg border border-purple-300/40 dark:border-purple-900/40 bg-purple-100/50 dark:bg-purple-900/10">
                  <div
                    className={`absolute inset-0 ${isLeading ? 'bg-purple-400/30 dark:bg-purple-600/25' : 'bg-purple-200/30 dark:bg-purple-900/15'} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] text-reddit-text comment-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(option.text) }}
                    />
                    <span className={`text-[10px] font-bold ${isLeading ? 'text-purple-700 dark:text-purple-300' : 'text-reddit-muted'}`}>
                      {option.votes} ({pct}%)
                    </span>
                  </div>
                  {option.voters && option.voters.length > 0 && (
                    <div className="relative px-3 pb-1.5 flex items-center gap-1 flex-wrap">
                      {option.voters.map((botId, vi) => {
                        const voterBot = getBotById(botId);
                        return voterBot ? (
                          <span key={vi} className="text-[10px]" title={voterBot.name}>{voterBot.avatar}</span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
            return totalVotes > 0 ? (
              <p className="text-[10px] text-reddit-muted mt-2 text-center">{totalVotes} {totalVotes !== 1 ? t('votesSubmittedPlural') : t('votesSubmitted')} {t('votesLabel')}</p>
            ) : null;
          })()}
        </div>
      ))}

    </div>
  );
}
