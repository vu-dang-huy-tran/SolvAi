import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, Paperclip, Image, FileText } from 'lucide-react';
import { getBotById, getLiveBots } from '../data/bots';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

export default function UserInputBox({ threadId, onSubmit, disabled, replyTarget, onClearReply, t }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null); // null = no dropdown, string = filter
  const [mentionIndex, setMentionIndex] = useState(0);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const replyBot = replyTarget ? getBotById(replyTarget.botId) : null;

  // Compute mention suggestions
  const allBots = getLiveBots();
  const mentionSuggestions = mentionQuery !== null
    ? allBots.filter(b => b.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  // Detect @mention trigger from cursor position
  function detectMention(value, cursorPos) {
    const before = value.slice(0, cursorPos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(botName) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const matchStart = before.lastIndexOf('@');
    if (matchStart === -1) return;
    const newText = before.slice(0, matchStart) + '@' + botName + ' ' + after;
    setText(newText);
    setMentionQuery(null);
    // Restore focus and cursor
    setTimeout(() => {
      const newPos = matchStart + botName.length + 2; // @name + space
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function handleChange(e) {
    const value = e.target.value;
    setText(value);
    detectMention(value, e.target.selectionStart);
  }

  function handleFileSelect(e) {
    const selected = Array.from(e.target.files).filter(
      f => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_SIZE
    );
    setFiles(prev => [...prev, ...selected].slice(0, 5));
    e.target.value = '';
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if ((!text.trim() && files.length === 0) || loading) return;

    setLoading(true);
    try {
      await onSubmit(threadId, text.trim() || '(Datei-Anhang)', replyTarget?.id || null, files);
      setText('');
      setFiles([]);
      setMentionQuery(null);
      onClearReply?.();
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    // Handle mention dropdown navigation
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="border-t border-reddit-border bg-reddit-surface/40 px-4 py-3 flex-shrink-0">
      {replyTarget && (
        <div className="flex items-center gap-2 mb-2 ml-10 px-2 py-1 rounded bg-reddit-border/20 border-l-2 text-xs text-reddit-muted" style={{ borderColor: replyBot?.color || '#FF4500' }}>
          <span>{t('replyTo')}</span>
          <span className="font-medium" style={{ color: replyBot?.color || '#FF4500' }}>
            {replyBot?.name || 'Bot'}
          </span>
          <span className="truncate max-w-[160px] opacity-70">{replyTarget.content.slice(0, 50)}…</span>
          <button type="button" onClick={onClearReply} className="ml-auto hover:text-reddit-text flex-shrink-0">
            <X size={11} />
          </button>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 ml-10">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-reddit-border/30 rounded px-2 py-1 text-[10px]">
              {file.type.startsWith('image/') ? <Image size={11} className="text-blue-400" /> : <FileText size={11} className="text-orange-400" />}
              <span className="text-reddit-text truncate max-w-[80px]">{file.name}</span>
              <button type="button" onClick={() => removeFile(i)} className="text-reddit-muted hover:text-red-400">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-reddit-orange/20 border-2 border-reddit-orange/50 flex items-center justify-center text-sm flex-shrink-0 mb-0.5">
          👤
        </div>

        {/* Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder={t('userInputPlaceholder')}
            rows={2}
            disabled={loading || disabled}
            className="w-full bg-reddit-bg border border-reddit-border rounded-xl px-3 py-2 pr-10 text-sm text-reddit-text placeholder-reddit-muted resize-none focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/20 transition-colors disabled:opacity-50"
          />

          {/* Mention autocomplete dropdown */}
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-72 max-h-56 overflow-y-auto bg-reddit-surface border border-reddit-border rounded-lg shadow-lg z-50">
              {mentionSuggestions.map((bot, i) => (
                <button
                  key={bot.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(bot.name); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    i === mentionIndex
                      ? 'bg-reddit-orange/20 text-reddit-text'
                      : 'text-reddit-muted hover:bg-reddit-hover'
                  }`}
                >
                  <span className="text-lg flex-shrink-0">{bot.avatar}</span>
                  <span className="font-medium text-reddit-text">{bot.name}</span>
                  <span className="text-xs text-reddit-muted truncate">{bot.flair}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Attach button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || disabled}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-reddit-surface border border-reddit-border text-reddit-muted flex items-center justify-center hover:text-reddit-text hover:border-reddit-orange/50 disabled:opacity-40 transition-colors mb-0.5"
          title={t('attachFilesShort')}
        >
          <Paperclip size={15} />
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={(!text.trim() && files.length === 0) || loading || disabled}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-reddit-orange text-white flex items-center justify-center hover:bg-reddit-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-0.5"
          title={t('send')}
        >
          {loading
            ? <Loader2 size={15} className="animate-spin" />
            : <Send size={15} />
          }
        </button>
      </form>

      <p className="text-[10px] text-reddit-muted mt-1.5 ml-10">
        {t('userInputHint')} • <kbd className="bg-reddit-border px-1 rounded">Enter</kbd> {t('send')}, <kbd className="bg-reddit-border px-1 rounded">Shift+Enter</kbd> {t('newLine')}
      </p>
    </div>
  );
}
