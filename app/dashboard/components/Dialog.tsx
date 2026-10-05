'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/** A plain centred dialog. Escape and the backdrop both close it. */
export default function Dialog({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl
                   p-5 shadow-modal max-h-[90dvh] overflow-y-auto overscroll-contain
                   pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="font-bold text-foreground">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={t('schedule.close')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
