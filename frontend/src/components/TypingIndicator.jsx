import { Globe } from 'lucide-react';
import { getBotById } from '../data/bots';

export default function TypingIndicator({ botId, task, researchStatus, t }) {
  const bot = getBotById(botId);
  const isResearching = bot.isDeepResearch || task === 'deep_research';

  return (
    <div className="flex gap-3 animate-fade-in">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 animate-pulse mt-0.5"
        style={{ borderColor: bot.color + '80', backgroundColor: bot.color + '20' }}
      >
        {bot.avatar}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="font-semibold text-sm" style={{ color: bot.color }}>
            {bot.name}
          </span>
          <span className="text-[10px] text-reddit-muted/70 bg-reddit-border/40 px-1.5 py-0.5 rounded">
            {bot.flair}
          </span>
          {isResearching ? (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 animate-pulse">
              <Globe size={10} />
              {researchStatus ? `${t('researching')} (${researchStatus})` : t('searchingWeb')}
            </span>
          ) : (
            <span className="text-[10px] text-blue-400 italic animate-pulse">
              {t('analyzing')}
            </span>
          )}
        </div>

        {isResearching ? (
          /* Research progress bar */
          <div
            className="px-3 py-2 rounded-xl text-xs"
            style={{ backgroundColor: bot.color + '15', border: `1px solid ${bot.color}30` }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Globe size={11} style={{ color: bot.color }} className="animate-spin" />
              <span className="text-reddit-muted">{t('deepResearchRunning')}</span>
            </div>
            <div className="h-1 rounded-full bg-reddit-border overflow-hidden">
              <div
                className="h-full rounded-full animate-pulse"
                style={{
                  width: '60%',
                  background: `linear-gradient(90deg, ${bot.color}80, ${bot.color})`,
                  animation: 'indeterminateProgress 2s ease-in-out infinite',
                }}
              />
            </div>
            <p className="text-[10px] text-reddit-muted mt-1">
              {t('analyzingSources')}
            </p>
          </div>
        ) : (
          /* Normal typing dots */
          <div
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl"
            style={{ backgroundColor: bot.color + '15', border: `1px solid ${bot.color}30` }}
          >
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: bot.color,
                  animation: 'bounceDot 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
