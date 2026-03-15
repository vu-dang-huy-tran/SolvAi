import { Settings, BarChart3, Scroll, Sun, Moon } from 'lucide-react';

export default function Header({ onHome, onSettings, onStats, onLogs, theme, onToggleTheme, t }) {
  return (
    <header className="h-12 bg-reddit-surface border-b border-reddit-border flex items-center px-4 gap-3 z-10 flex-shrink-0">
      {/* Logo */}
      <button onClick={onHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span className="text-xl">🤖</span>
        <span className="font-bold text-reddit-text tracking-tight">
          Solv<span className="text-reddit-orange">AI</span>
        </span>
        <span className="text-xs text-reddit-muted bg-reddit-border px-2 py-0.5 rounded-full ml-1">
          {t('aiDiscussionForum')}
        </span>
      </button>

      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={onStats}
        className="p-2 text-reddit-muted hover:text-reddit-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
        title={t('botStats')}
      >
        <BarChart3 size={16} />
      </button>

      <button
        onClick={onLogs}
        className="p-2 text-reddit-muted hover:text-reddit-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
        title={t('botLog')}
      >
        <Scroll size={16} />
      </button>

      <button
        onClick={onToggleTheme}
        className="p-2 text-reddit-muted hover:text-reddit-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
        title={theme === 'dark' ? t('dayMode') : t('nightMode')}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <button
        onClick={onSettings}
        className="p-2 text-reddit-muted hover:text-reddit-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
        title={t('settings')}
      >
        <Settings size={16} />
      </button>
    </header>
  );
}
