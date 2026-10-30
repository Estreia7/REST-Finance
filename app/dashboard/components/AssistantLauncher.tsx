'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, ArrowUp, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';

/**
 * "Pergunta": a round button on every dashboard screen that opens a chat about
 * the restaurant's own numbers.
 *
 * The conversation lives here, in the browser, and goes to /api/assistant
 * whole on every question; nothing is stored. Ctrl/Cmd+K opens it, Esc closes.
 */

interface Turn { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = ['assistant.suggest1', 'assistant.suggest2', 'assistant.suggest3'] as const;

export default function AssistantLauncher({ raised = false }: {
  /** Sits higher on a phone when the dashboard's own "+" button is showing. */
  raised?: boolean;
}) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [turns, busy]);

  const ask = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The last ten exchanges are enough context, and keep each question cheap.
        body: JSON.stringify({ language, messages: next.slice(-20) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.answer !== 'string') {
        setError(translateError(language, data.error ?? 'assistant.failed'));
      } else {
        setTurns([...next, { role: 'assistant', content: data.answer }]);
      }
    } catch {
      setError(t('assistant.failed'));
    } finally {
      setBusy(false);
    }
  }, [busy, turns, language, t]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('assistant.open')}
          title={`${t('assistant.open')} (Ctrl+K)`}
          className={`fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:bottom-6 md:right-6 ${
            raised ? 'bottom-[calc(10.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(6rem+env(safe-area-inset-bottom))]'
          } right-[calc(1rem+env(safe-area-inset-right))]`}
        >
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={t('assistant.title')}
          className="fixed inset-0 z-50 flex flex-col bg-card md:inset-auto md:bottom-6 md:right-6 md:h-[min(620px,calc(100dvh-3rem))] md:w-[400px] md:rounded-2xl md:border md:border-border md:shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-ink" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">{t('assistant.title')}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <p className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
            {t('assistant.disclosure')}
          </p>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-foreground">{t('assistant.emptyTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('assistant.emptyBody')}</p>
                <div className="mt-5 flex flex-col gap-2">
                  {SUGGESTIONS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => ask(t(k))}
                      className="rounded-full border border-border bg-card px-4 py-2 text-xs text-foreground hover:bg-muted"
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  turn.role === 'user' ? 'bg-foreground text-background' : 'bg-muted text-foreground'
                }`}>
                  {turn.content}
                </p>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{t('assistant.thinking')}
              </div>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <form
            className="border-t border-border p-3"
            onSubmit={(e) => { e.preventDefault(); ask(draft); }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-input px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={1000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
                placeholder={t('assistant.placeholder')}
                aria-label={t('assistant.placeholder')}
                className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                aria-label={t('assistant.send')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
