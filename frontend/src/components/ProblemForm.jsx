import { useState, useRef } from 'react';
import { Send, Loader2, X, Paperclip, Image, FileText } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

export default function ProblemForm({ onSubmit, onCancel, t }) {
  const [problem, setProblem] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

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
    if (!problem.trim()) return;

    setLoading(true);
    setError('');
    try {
      await onSubmit(problem.trim(), files);
      setProblem('');
      setFiles([]);
    } catch (err) {
      setError(err.message || t('errorCreateThread'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-slide-down">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-reddit-text">{t('problemFormTitle')}</h1>
          <p className="text-reddit-muted text-sm mt-1">
            {t('problemFormSubtitle')}
          </p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-reddit-muted hover:text-reddit-text p-2 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-reddit-text mb-2">
            {t('yourProblem')}
          </label>
          <textarea
            value={problem}
            onChange={e => setProblem(e.target.value)}
            placeholder={t('problemPlaceholder')}
            rows={5}
            className="w-full bg-reddit-surface border border-reddit-border rounded-xl px-4 py-3 text-reddit-text placeholder-reddit-muted resize-none focus:outline-none focus:border-reddit-orange/60 focus:ring-1 focus:ring-reddit-orange/30 transition-colors text-sm"
            disabled={loading}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-reddit-muted">{t('minChars')}</span>
            <span className={`text-xs ${problem.length > 1000 ? 'text-red-400' : 'text-reddit-muted'}`}>
              {problem.length}/1000
            </span>
          </div>
        </div>

        {/* File attachment */}
        <div className="space-y-2">
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-reddit-border text-reddit-muted hover:text-reddit-text hover:border-reddit-orange/50 transition-colors text-sm"
          >
            <Paperclip size={14} />
            {t('attachFiles')}
          </button>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file, i) => (
                <div key={i} className="relative flex items-center gap-2 bg-reddit-surface border border-reddit-border rounded-lg px-3 py-2 text-xs">
                  {file.type.startsWith('image/') ? <Image size={14} className="text-blue-400" /> : <FileText size={14} className="text-orange-400" />}
                  <span className="text-reddit-text truncate max-w-[120px]">{file.name}</span>
                  <span className="text-reddit-muted">({(file.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-reddit-muted hover:text-red-400">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || problem.trim().length < 10}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-reddit-orange text-white rounded-xl font-semibold hover:bg-reddit-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('creatingThread')}
            </>
          ) : (
            <>
              <Send size={16} />
              {t('submitProblem')}
            </>
          )}
        </button>
      </form>

      {/* Examples */}
      <div className="mt-8">
        <p className="text-xs text-reddit-muted uppercase tracking-wider mb-3">{t('examples')}</p>
        <div className="grid gap-2">
          {(t('exampleProblems') || []).map((ex, i) => (
            <button
              key={i}
              onClick={() => setProblem(ex)}
              className="text-left p-3 rounded-lg border border-reddit-border/50 text-xs text-reddit-muted hover:text-reddit-text hover:border-reddit-border hover:bg-white/5 transition-all"
            >
              "{ex}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
