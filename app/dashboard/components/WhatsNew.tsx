'use client';

import { useState, useEffect } from 'react';
import { Sparkles, X, Plus, ArrowUpRight, Wrench } from 'lucide-react';
import {
  CHANGELOG, CHANGELOG_VERSION, KIND_LABEL, KIND_LABEL_EN,
  groupByKind, hasUnread, type ChangeKind,
} from '@/lib/changelog';
import { useLanguage } from '@/lib/language-context';

/**
 * "What's new", in the top bar.
 *
 * A restaurant owner opens this app between services, not to follow its
 * development. So the entry point is a quiet icon with a dot when there is
 * something unread, and the dot clears the moment they look — never a modal
 * that interrupts someone checking yesterday's takings.
 *
 * The last-seen version lives in localStorage: it is a per-browser
 * convenience, worth nothing to anyone else, and not worth a database write
 * or a column on the user.
 */

const STORAGE_KEY = 'rest-finance-changelog-seen';

const KIND_STYLE: Record<ChangeKind, { icon: typeof Plus; chip: string; dot: string }> = {
  new: { icon: Plus, chip: 'bg-success/15 text-green-400', dot: 'bg-lamp-success' },
  improvement: { icon: ArrowUpRight, chip: 'bg-info/15 text-info', dot: 'bg-info' },
  fix: { icon: Wrench, chip: 'bg-warning/15 text-amber-400', dot: 'bg-lamp-warning' },
};

export default function WhatsNew() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    // Wrapped: private windows and blocked site data both throw here, and a
    // changelog is never worth breaking the top bar over.
    try {
      setUnread(hasUnread(localStorage.getItem(STORAGE_KEY)));
    } catch {
      setUnread(false);
    }
  }, []);

  const openPanel = () => {
    setOpen(true);
    setUnread(false);
    try {
      localStorage.setItem(STORAGE_KEY, CHANGELOG_VERSION);
    } catch {
      // Nothing to do: they simply see the dot again next time.
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const labels = language === 'pt' ? KIND_LABEL : KIND_LABEL_EN;
  const title = language === 'pt' ? 'Novidades' : "What's new";

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={title}
        title={title}
      >
        <Sparkles className="w-[18px] h-[18px]" aria-hidden="true" />
        {unread && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background"
            aria-label={language === 'pt' ? 'Há novidades' : 'Unread updates'}
          />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full sm:w-[420px] sm:m-4 bg-card border border-border
                       rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[85vh] sm:max-h-[80vh]
                       flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle shrink-0">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                {title}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label={language === 'pt' ? 'Fechar' : 'Close'}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
              {CHANGELOG.map((release) => (
                <section key={release.version}>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h4 className="text-sm font-bold text-foreground">
                      {new Date(release.date).toLocaleDateString(
                        language === 'pt' ? 'pt-PT' : 'en-GB',
                        { day: 'numeric', month: 'long', year: 'numeric' }
                      )}
                    </h4>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {release.version}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {groupByKind(release.entries).map(({ kind, entries }) => {
                      const style = KIND_STYLE[kind];
                      const Icon = style.icon;
                      return (
                        <div key={kind}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase
                                              tracking-wider px-1.5 py-0.5 rounded-md ${style.chip}`}>
                              <Icon className="w-3 h-3" aria-hidden="true" />
                              {labels[kind]}
                            </span>
                          </div>

                          <ul className="space-y-2.5">
                            {entries.map((entry) => (
                              <li key={entry.title} className="flex gap-2.5">
                                <span
                                  className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-foreground">
                                    {entry.title}
                                  </span>
                                  {entry.detail && (
                                    <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                      {entry.detail}
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
