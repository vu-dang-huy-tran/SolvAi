import { useState } from 'react';
import { ArrowUp, CornerDownRight, Reply, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getDateLocale } from '../data/lang';
import { getBotById } from '../data/bots';

const TASK_COLORS = {
  analyze:        'bg-purple-900/40 text-purple-300',
  deep_research:  'bg-fuchsia-900/40 text-fuchsia-300',
  tech_solution:  'bg-cyan-900/40 text-cyan-300',
  org_solution:   'bg-indigo-900/40 text-indigo-300',
  pro_argument:   'bg-green-900/40 text-green-300',
  contra_argument:'bg-red-900/40 text-red-300',
  moderate:       'bg-slate-700/60 text-slate-300',
  rate_solutions: 'bg-amber-900/40 text-amber-300',
  synthesize:     'bg-orange-900/40 text-orange-300',
  conclude:       'bg-emerald-900/40 text-emerald-300',
  react_to_user:  'bg-orange-900/30 text-orange-300',
  close_verdict:  'bg-yellow-900/50 text-yellow-200',
  user_input:     'bg-reddit-orange/30 text-orange-400',
  discuss:        'bg-blue-900/40 text-blue-300',
  solution:       'bg-yellow-900/40 text-yellow-300',
  evaluate:       'bg-orange-900/40 text-orange-300',
};

const TASK_LABEL_KEYS = {
  analyze: 'taskAnalyze', deep_research: 'taskDeepResearch', tech_solution: 'taskTechSolution',
  org_solution: 'taskOrgSolution', pro_argument: 'taskProArgument', contra_argument: 'taskContraArgument',
  moderate: 'taskModerate', rate_solutions: 'taskRateSolutions', synthesize: 'taskSynthesize',
  conclude: 'taskConclude', react_to_user: 'taskReactToUser', close_verdict: 'taskCloseVerdict',
  user_input: 'taskUserInput', discuss: 'taskDiscuss', solution: 'taskSolution', evaluate: 'taskEvaluate',
};

function getTaskInfo(task, t) {
  const key = TASK_LABEL_KEYS[task] || TASK_LABEL_KEYS.discuss;
  const color = TASK_COLORS[task] || TASK_COLORS.discuss;
  return { label: t ? t(key) : task, color };
}

function getBorderStyle(task, stance, isHuman) {
  if (isHuman) return '3px solid #FF4500';
  if (stance === 'pro' || task === 'pro_argument')       return '3px solid #22c55e';
  if (stance === 'contra' || task === 'contra_argument') return '3px solid #ef4444';
  if (task === 'tech_solution')  return '3px solid #06b6d4';
  if (task === 'org_solution')   return '3px solid #6366f1';
  if (task === 'synthesize')     return '3px solid #f97316';
  if (task === 'conclude')       return '3px solid #10b981';
  if (task === 'analyze')        return '3px solid #a855f7';
  if (task === 'react_to_user')  return '3px solid #FF4500';
  return 'none';
}

export function renderMarkdown(text) {
  // Code blocks first (before other transforms)
  let html = text.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`);
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Thread links (internal cross-references)
  html = html.replace(/\[([^\]]+)\]\(thread:([a-f0-9-]+)\)/g, '<a href="#" data-thread-id="$2" class="thread-link text-reddit-orange hover:underline cursor-pointer">📌 $1</a>');
  // External links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-reddit-text mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-reddit-text mt-3 mb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-reddit-text mt-3 mb-1">$1</h1>');
  // Bold & italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="border-reddit-border my-2"/>');
  // Numbered lists
  html = html.replace(/^(\d+)\.\s(.+)/gm, '<li class="ml-4 list-decimal">$2</li>');
  // Bullet lists
  html = html.replace(/^[-•]\s(.+)/gm, '<li class="ml-4 list-disc">$1</li>');
  // Paragraphs & line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

const API = 'http://localhost:3001';

function AttachmentPreview({ attachment }) {
  const url = `${API}${attachment.url}`;
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={attachment.originalName} className="max-w-[240px] max-h-[180px] rounded-lg border border-reddit-border object-cover hover:opacity-90 transition-opacity" />
      </a>
    );
  }
  if (attachment.mimeType === 'application/pdf') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-reddit-border bg-reddit-surface/50 hover:bg-reddit-surface text-sm transition-colors">
        <FileText size={16} className="text-orange-400" />
        <span className="text-reddit-text truncate max-w-[160px]">{attachment.originalName}</span>
        <span className="text-reddit-muted text-xs">({(attachment.size / 1024).toFixed(0)} KB)</span>
      </a>
    );
  }
  return null;
}

function Attachments({ attachments }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map(att => <AttachmentPreview key={att.id} attachment={att} />)}
    </div>
  );
}

export default function Comment({ comment, prevComments, onReply, onThreadClick, t }) {
  const [userDelta, setUserDelta] = useState(0);
  const [voted, setVoted] = useState(null);
  const votes = (comment.upvotes || 0) + userDelta;

  const isHuman = comment.isHuman === true || comment.botId === 'human';
  const bot = isHuman ? null : getBotById(comment.botId);

  const replyTarget = comment.replyTo
    ? prevComments?.find(c => c.id === comment.replyTo)
    : null;
  const replyBot = replyTarget
    ? (replyTarget.isHuman ? null : getBotById(replyTarget.botId))
    : null;

  const taskInfo = getTaskInfo(comment.task, t);
  const borderStyle = getBorderStyle(comment.task, comment.stance, isHuman);

  function handleVote(dir) {
    if (voted === dir) {
      setUserDelta(d => dir === 'up' ? d - 1 : d + 1);
      setVoted(null);
    } else {
      setUserDelta(d => dir === 'up' ? d + (voted === 'down' ? 2 : 1) : d - (voted === 'up' ? 2 : 1));
      setVoted(dir);
    }
  }

  const isResearch = comment.task === 'deep_research';

  // ── Human comment ──────────────────────────────────────────────────────────
  if (isHuman) {
    return (
      <div
        className="bot-comment flex gap-3 pl-2 animate-slide-down"
        style={{ borderLeft: borderStyle }}
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 mt-0.5 bg-reddit-orange/20 border-reddit-orange/60">
          👤
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-sm text-reddit-orange">{t('you')}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-reddit-orange/20 text-reddit-orange">
              {t('taskUserInput')}
            </span>
            <span className="text-[10px] text-reddit-muted ml-auto flex-shrink-0">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: getDateLocale(t('_lang')) })}
            </span>
          </div>
          {replyTarget && (
            <div className="flex items-center gap-1.5 mb-2 text-xs text-reddit-muted bg-reddit-border/20 px-2 py-1 rounded border-l-2 border-reddit-border">
              <CornerDownRight size={11} />
              {replyTarget.isHuman
                ? <span className="text-reddit-orange">Du</span>
                : <span style={{ color: replyBot?.color }}>{replyBot?.name}</span>
              }
              <span className="truncate max-w-[200px]">{replyTarget.content.slice(0, 60)}...</span>
            </div>
          )}
          <div
            className="comment-content text-sm text-reddit-text leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.content) }}
          />
          <Attachments attachments={comment.attachments} />
        </div>
      </div>
    );
  }

  // ── Bot comment ────────────────────────────────────────────────────────────
  return (
    <div
      className={`bot-comment flex gap-3 pl-2 ${isResearch ? 'research-comment rounded-lg p-2' : ''}`}
      style={{ borderLeft: borderStyle }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 mt-0.5"
        style={{ borderColor: bot.color + '60', backgroundColor: bot.color + '20' }}
        title={`${bot.name} – ${bot.flair}`}
      >
        {bot.avatar}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="font-semibold text-sm" style={{ color: bot.color }}>
            {bot.name}
          </span>
          <span className="text-[10px] text-reddit-muted/70 bg-reddit-border/40 px-1.5 py-0.5 rounded">
            {bot.flair}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${taskInfo.color}`}>
            {taskInfo.label}
          </span>
          {comment.stanceTarget && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono truncate max-w-[160px] ${
              comment.stance === 'pro'
                ? 'border-green-700/50 text-green-400 bg-green-900/20'
                : 'border-red-700/50 text-red-400 bg-red-900/20'
            }`}>
              re: "{comment.stanceTarget}"
            </span>
          )}
          {comment.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-reddit-border/30 text-reddit-muted font-mono truncate max-w-[180px]" title={comment.model}>
              🤖 {comment.model}
            </span>
          )}
          <span className="text-[10px] text-reddit-muted ml-auto flex-shrink-0">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: getDateLocale(t('_lang')) })}
          </span>
        </div>

        {/* Reply reference */}
        {replyTarget && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-reddit-muted bg-reddit-border/20 px-2 py-1 rounded border-l-2 border-reddit-border">
            <CornerDownRight size={11} />
            {replyTarget.isHuman
              ? <span className="text-reddit-orange">{t('you')}</span>
              : <span style={{ color: replyBot?.color }}>{replyBot?.name}</span>
            }
            <span className="truncate max-w-[200px]">{replyTarget.content.slice(0, 60)}...</span>
          </div>
        )}

        <div
          className="comment-content text-sm text-reddit-text leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.content) }}
          onClick={e => {
            const link = e.target.closest('.thread-link');
            if (link) {
              e.preventDefault();
              const threadId = link.dataset.threadId;
              if (threadId && onThreadClick) onThreadClick(threadId);
            }
          }}
        />
        <Attachments attachments={comment.attachments} />

        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={() => handleVote('up')}
            className={`vote-btn ${voted === 'up' ? 'text-reddit-orange' : ''}`}
          >
            <ArrowUp size={13} />
            <span>{votes}</span>
          </button>
          <button
            onClick={() => handleVote('down')}
            className={`vote-btn ${voted === 'down' ? 'text-blue-400' : ''}`}
          >
            <ArrowUp size={13} className="rotate-180" />
          </button>
          {onReply && (
            <button
              onClick={() => onReply(comment)}
              className="vote-btn ml-1 gap-1 text-reddit-muted hover:text-reddit-text"
            >
              <Reply size={12} />
              <span className="text-[10px]">{t('reply')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
