import { formatDistanceToNow } from 'date-fns';
import { getDateLocale } from '../data/lang';
import { MessageCircle, Trophy, Zap, CheckCircle2 } from 'lucide-react';

export default function ThreadList({ threads, selectedId, onSelect, onDelete, t }) {
  if (threads.length === 0) {
    return (
      <div className="text-center py-8 text-reddit-muted text-sm">
        <div className="text-3xl mb-2">💭</div>
        <p>{t('emptyState')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {threads.map(thread => (
        <ThreadItem
          key={thread.id}
          thread={thread}
          selected={thread.id === selectedId}
          onClick={() => onSelect(thread.id)}
          onDelete={() => onDelete && onDelete(thread.id)}
          t={t}
        />
      ))}
    </div>
  );
}

function ThreadItem({ thread, selected, onClick, onDelete, t }) {
  const statusColor = {
    active: 'text-yellow-400',
    discussing: 'text-blue-400',
    resolved: 'text-green-400',
  }[thread.status] || 'text-reddit-muted';

  const StatusIcon = {
    active: Zap,
    discussing: MessageCircle,
    resolved: CheckCircle2,
  }[thread.status] || Zap;

  return (
    <div className={`thread-item flex items-center w-full ${selected ? 'active' : ''}`}>
      <button
        onClick={onClick}
        className="flex-1 text-left"
        style={{ background: 'none', border: 'none', padding: 0 }}
      >
        <div className="flex items-start gap-2">
          <StatusIcon size={13} className={`${statusColor} mt-0.5 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-reddit-text leading-snug line-clamp-2 font-medium">
              {thread.problem}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-reddit-muted">
                {thread.comments?.length || 0} {t('comments')}
              </span>
              {thread.solutions?.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-yellow-500">
                  <Trophy size={9} />
                  {thread.solutions.length} {thread.solutions.length !== 1 ? t('solutions') : t('solution')}
                </span>
              )}
              <span className="text-[10px] text-reddit-muted ml-auto">
                {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true, locale: getDateLocale(t('_lang')) })}
              </span>
            </div>
          </div>
        </div>
        {thread.typing && (
          <div className="mt-1.5 flex items-center gap-1">
            <TypingDots />
            <span className="text-[10px] text-reddit-muted">{t('botTyping')}</span>
          </div>
        )}
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete && onDelete(); }}
        className="ml-2 text-red-400 hover:text-red-200 px-2 py-1 rounded"
        title={t('deleteThread')}
      >
        &#128465;
      </button>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-blue-400"
          style={{
            animation: `bounceDot 1.4s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
