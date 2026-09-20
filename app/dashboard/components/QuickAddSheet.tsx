'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, TrendingUp, Receipt, Keyboard, Camera, ChevronLeft } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/**
 * What the + button asks before it takes you anywhere.
 *
 * The button used to drop the owner straight into the revenue form, which is
 * right about half the time: the other half they are holding a supplier
 * invoice, not the day's till total. Rather than guess, it asks — two taps,
 * both of them large, on the two questions that actually decide the
 * destination: what is being added, and whether they want to type it or
 * photograph it.
 *
 * Two steps rather than four buttons in a grid. The second question only
 * makes sense once the first is answered, and a 2x2 of combinations reads as
 * four unrelated options rather than two choices.
 */

export type QuickAddKind = 'revenue' | 'costs';
export type QuickAddMethod = 'entry' | 'scan';

interface QuickAddSheetProps {
  /** Chosen destination. The dashboard switches tab and sub-view to match. */
  onChoose: (kind: QuickAddKind, method: QuickAddMethod) => void;
  onClose: () => void;
}

export default function QuickAddSheet({ onChoose, onClose }: QuickAddSheetProps) {
  const { t } = useLanguage();
  /** Null until the first question is answered; then the second is shown. */
  const [kind, setKind] = useState<QuickAddKind | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the sheet so a keyboard user is not
  // left behind on the page underneath.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Back to the first question, or out of the sheet if that is where we are. */
  const back = useCallback(() => {
    if (kind) setKind(null);
    else onClose();
  }, [kind, onClose]);

  const title = kind ? t('quickAdd.howTitle') : t('quickAdd.whatTitle');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-modal"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            {kind && (
              <button
                type="button"
                onClick={back}
                aria-label={t('common.back')}
                className="-ml-1.5 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <h2 id="quick-add-title" className="font-semibold text-foreground truncate">
              {title}
            </h2>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5 pt-2">
          {kind === null ? (
            <>
              <Choice
                icon={<TrendingUp className="w-6 h-6" aria-hidden="true" />}
                label={t('quickAdd.revenue')}
                hint={t('quickAdd.revenueHint')}
                tone="revenue"
                onClick={() => setKind('revenue')}
              />
              <Choice
                icon={<Receipt className="w-6 h-6" aria-hidden="true" />}
                label={t('quickAdd.cost')}
                hint={t('quickAdd.costHint')}
                tone="cost"
                onClick={() => setKind('costs')}
              />
            </>
          ) : (
            <>
              <Choice
                icon={<Keyboard className="w-6 h-6" aria-hidden="true" />}
                label={t('quickAdd.manual')}
                hint={t('quickAdd.manualHint')}
                tone="neutral"
                onClick={() => onChoose(kind, 'entry')}
              />
              <Choice
                icon={<Camera className="w-6 h-6" aria-hidden="true" />}
                label={t('quickAdd.photo')}
                hint={t('quickAdd.photoHint')}
                tone="neutral"
                onClick={() => onChoose(kind, 'scan')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One of the two choices on either step.
 *
 * Tall enough to be hit with a thumb without looking, and captioned: "Ticket"
 * and "Despesa" alone are the app's vocabulary, not necessarily the owner's,
 * and one line underneath costs nothing to read.
 */
function Choice({
  icon, label, hint, tone, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone: 'revenue' | 'cost' | 'neutral';
  onClick: () => void;
}) {
  // Revenue and cost carry the colours they have everywhere else in the app,
  // so the choice is recognisable before the label is read. The second step
  // is deliberately neutral: manual and photo are not good and bad.
  const toneClass =
    tone === 'revenue'
      ? 'text-warning bg-warning/10'
      : tone === 'cost'
        ? 'text-destructive bg-destructive/10'
        : 'text-foreground bg-muted';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border-subtle bg-card p-4
                 text-center transition-colors hover:border-primary hover:bg-muted/50
                 active:scale-[0.98]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`flex items-center justify-center w-12 h-12 rounded-xl ${toneClass}`}>
        {icon}
      </span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground leading-snug">{hint}</span>
    </button>
  );
}
