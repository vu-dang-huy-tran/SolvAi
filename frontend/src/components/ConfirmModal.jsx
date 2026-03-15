import { Trash2, X } from 'lucide-react';

export default function ConfirmModal({ message, onConfirm, onCancel, t }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-reddit-card border border-reddit-border rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-reddit-muted hover:text-reddit-text transition-colors"
        >
          <X size={16} />
        </button>

        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mb-4 mx-auto">
          <Trash2 size={22} className="text-red-400" />
        </div>

        {/* Text */}
        <h2 className="text-reddit-text text-center font-semibold text-base mb-1">
          {t('confirmDeleteTitle')}
        </h2>
        <p className="text-reddit-muted text-center text-sm mb-6">
          {message || t('confirmDeleteMessage')}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-reddit-border text-reddit-text text-sm hover:bg-reddit-border/30 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
