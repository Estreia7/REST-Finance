'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { checklistProgress, type ChecklistItem } from '@/lib/onboarding';
import { getSetupChecklist, dismissSetupChecklist } from '@/app/onboarding/actions';

/**
 * What is still missing from the restaurant's setup, until it is all there.
 *
 * Whatever the wizard skipped ends up here, each line opening the tab where it
 * is done. Hidden once complete or dismissed; dismissal is stored per
 * restaurant, so it follows the owner to another device.
 */
export default function SetupChecklist({
  refreshKey,
  onOpen,
}: {
  /** Bumped by the dashboard after any save, so ticks appear as things are done. */
  refreshKey: number;
  onOpen: (tab: ChecklistItem['tab']) => void;
}) {
  const { t } = useLanguage();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);

  useEffect(() => {
    let stale = false;
    getSetupChecklist().then((r) => {
      if (!stale && r.success) setItems(r.data);
    });
    return () => { stale = true; };
  }, [refreshKey]);

  if (!items) return null;
  const { done, total } = checklistProgress(items);
  if (done === total) return null;

  const dismiss = async () => {
    setItems(null);
    await dismissSetupChecklist();
  };

  return (
    <section className="card-glass p-5 sm:p-6" aria-labelledby="setup-checklist-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="setup-checklist-title" className="text-base font-semibold text-foreground">{t('setupChecklist.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('setupChecklist.lead')}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold tabular-nums text-foreground">{done}/{total}</span>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('setupChecklist.dismiss')}
            title={t('setupChecklist.dismiss')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-4 h-1.5 rounded-full bg-border overflow-hidden" aria-hidden="true">
        <div className="h-full bg-primary rounded-full transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <ul className="mt-4 grid gap-1 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onOpen(item.tab)}
              disabled={item.done}
              className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted disabled:hover:bg-transparent disabled:cursor-default"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  item.done ? 'bg-primary text-primary-foreground' : 'border border-border'
                }`}
                aria-hidden="true"
              >
                {item.done && <Check className="h-3 w-3" />}
              </span>
              <span className={`flex-1 text-sm ${item.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {t(`setupChecklist.items.${item.key}`)}
                {item.done && <span className="sr-only"> — {t('setupChecklist.doneSr')}</span>}
              </span>
              {!item.done && <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
