import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { getDateLocale } from '../data/lang';
import { CheckCircle2, Zap, MessageCircle, FileText, Lock, Unlock, PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from 'lucide-react';
import Comment from './Comment';
import TypingIndicator from './TypingIndicator';
import SolutionPanel from './SolutionPanel';
import UserInputBox from './UserInputBox';

const API_URL = 'http://localhost:3001';

export default function ThreadView({ thread, onVote, onUserComment, onSelectThread, t }) {
  const bottomRef = useRef(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [solutionsMode, setSolutionsMode] = useState(() => {
    try { const v = localStorage.getItem('solvai-solutions-mode'); return ['normal','maximized','collapsed'].includes(v) ? v : 'normal'; } catch (_) { return 'normal'; }
  });
  useEffect(() => { localStorage.setItem('solvai-solutions-mode', solutionsMode); }, [solutionsMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.comments?.length, thread.typing]);

  const statusConfig = {
    active:     { icon: Zap,          color: 'text-yellow-400', label: t('waitingForBots') },
    discussing: { icon: MessageCircle, color: 'text-blue-400',   label: t('botsDiscussing') },
    resolved:   { icon: CheckCircle2, color: 'text-green-400',  label: t('discussionComplete') },
  };
  const { icon: StatusIcon, color: statusColor, label: statusLabel } =
    statusConfig[thread.status] || statusConfig.active;

  const toggleThreadStatus = async () => {
    const newStatus = thread.status === 'resolved' ? 'discussing' : 'resolved';
    try {
      await fetch(`${API_URL}/api/threads/${thread.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.error('Failed to update thread status:', err);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Comments Column ── */}
      {solutionsMode !== 'maximized' && (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Thread Header */}
        <div className="px-6 py-4 border-b border-reddit-border bg-reddit-surface/20 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-reddit-orange/20 border-2 border-reddit-orange/40 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
              👤
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-reddit-orange">{t('you')}</span>
                <span className="text-xs text-reddit-muted">
                  • {formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true, locale: getDateLocale(t('_lang')) })}
                </span>
              </div>
              <p className="text-reddit-text text-sm leading-relaxed">{thread.problem}</p>
              {thread.attachments && thread.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {thread.attachments.map(att => (
                    <ThreadAttachment key={att.id} attachment={att} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-reddit-border/50">
            <StatusIcon size={13} className={statusColor} />
            <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
            <span className="text-reddit-muted text-xs ml-auto">
              {thread.comments?.length || 0} {t('commentsCount')}
              {thread.solutions?.length > 0 && ` • ${thread.solutions.length} ${t('solutionsCount')}`}
            </span>
            <button
              onClick={toggleThreadStatus}
              className={`ml-2 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                thread.status === 'resolved'
                  ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                  : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              }`}
              title={thread.status === 'resolved' ? t('reopenThread') : t('closeThread')}
            >
              {thread.status === 'resolved' ? <Unlock size={12} /> : <Lock size={12} />}
              {thread.status === 'resolved' ? t('open') : t('close')}
            </button>
          </div>
        </div>

        {/* Comments scroll area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {(!thread.comments || thread.comments.length === 0) && !thread.typing && (
            <div className="text-center py-12 text-reddit-muted">
              <div className="text-4xl mb-3">🤔</div>
              <p className="text-sm">{t('botsActivating')}</p>
            </div>
          )}


          {/* Verschachtelte Anzeige: */}
          {thread.comments && renderNestedComments(thread.comments, setReplyTarget, null, 0, null, onSelectThread, t)}

          {thread.typing && (
            <TypingIndicator
              botId={thread.typing}
              task={thread.typingTask}
              researchStatus={thread.researchStatus}
              t={t}
            />
          )}

          <div ref={bottomRef} />
        </div>

        {/* User Input Box — always visible at bottom */}
        <UserInputBox
          threadId={thread.id}
          onSubmit={onUserComment}
          disabled={false}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
          t={t}
        />
      </div>
      )}

      {/* ── Solutions Sidebar ── */}
      {(thread.solutions?.length > 0 || thread.status === 'resolved' || thread.polls?.length > 0) && (
        <>
          <div className="flex-shrink-0 flex flex-col items-center justify-center w-6 gap-1 border-l border-reddit-border bg-reddit-surface/30">
            <button
              onClick={() => setSolutionsMode(s => s === 'maximized' ? 'normal' : 'maximized')}
              className="p-0.5 text-reddit-muted hover:text-reddit-text hover:bg-white/5 rounded transition-colors"
              title={solutionsMode === 'maximized' ? 'Normal' : 'Maximieren'}
            >
              {solutionsMode === 'maximized' ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              onClick={() => setSolutionsMode(s => s === 'collapsed' ? 'normal' : 'collapsed')}
              className="p-0.5 text-reddit-muted hover:text-reddit-text hover:bg-white/5 rounded transition-colors"
              title={solutionsMode === 'collapsed' ? 'Öffnen' : 'Schließen'}
            >
              {solutionsMode === 'collapsed' ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
            </button>
          </div>
          <aside className={`${solutionsMode === 'collapsed' ? 'w-0' : solutionsMode === 'maximized' ? 'flex-1' : 'w-80'} border-l border-reddit-border overflow-y-auto flex-shrink-0 transition-all duration-300 overflow-hidden`}>
            <div className={solutionsMode === 'maximized' ? '' : 'min-w-[20rem]'}>
              <SolutionPanel
                solutions={thread.solutions || []}
                threadId={thread.id}
                onVote={onVote}
                status={thread.status}
                polls={thread.polls || []}
                t={t}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function ThreadAttachment({ attachment }) {
  const url = `${API_URL}${attachment.url}`;
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt={attachment.originalName} className="max-w-[240px] max-h-[180px] rounded-lg border border-reddit-border object-cover hover:opacity-90 transition-opacity" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-reddit-border bg-reddit-surface/50 hover:bg-reddit-surface text-sm transition-colors">
      <FileText size={16} className="text-orange-400" />
      <span className="text-reddit-text truncate max-w-[160px]">{attachment.originalName}</span>
      <span className="text-reddit-muted text-xs">({(attachment.size / 1024).toFixed(0)} KB)</span>
    </a>
  );
}

// Hilfsfunktion für verschachtelte Kommentare
function renderNestedComments(comments, setReplyTarget, parentId = null, level = 0, allComments = null, onSelectThread = null, t = null) {
  if (!allComments) allComments = comments;
  return comments
    .filter(comment => (parentId ? comment.replyTo === parentId : !comment.replyTo))
    .map((comment, idx, arr) => (
      <div key={comment.id} style={{ marginLeft: level * 28 }}>
        <Comment
          comment={comment}
          prevComments={allComments.filter(c => c.createdAt <= comment.createdAt)}
          onReply={comment.isHuman ? null : setReplyTarget}
          onThreadClick={onSelectThread}
          t={t}
        />
        {renderNestedComments(allComments, setReplyTarget, comment.id, level + 1, allComments, onSelectThread, t)}
      </div>
    ));
}
