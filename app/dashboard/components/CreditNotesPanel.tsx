'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { translateError } from '@/lib/error-messages';
import {
  dismissCreditNote,
  getCreditNotes,
  matchCreditNote,
  reopenCreditNote,
  type CreditNoteRow,
} from '../credit-note-actions';

/**
 * Credit notes: the ones waiting for their invoice, then the ones settled.
 *
 * None of these is a cost. A note waits here until the invoice of the same
 * value is on file; one matched cancels that invoice, and can be undone.
 */
export default function CreditNotesPanel() {
  const { t, language } = useLanguage();
  const [notes, setNotes] = useState<CreditNoteRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getCreditNotes().then((result) => {
      if ('error' in result) setFailed(true);
      else setNotes(result.data);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, run: () => Promise<{ error?: string }>, done: string) => {
    setBusy(id);
    const result = await run();
    setBusy(null);
    if (result.error) {
      toast.error(translateError(language, result.error));
      return;
    }
    toast.success(t(done));
    load();
  };

  if (failed) return <p className="text-sm text-muted-foreground">{t('credit.failed')}</p>;
  if (!notes) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="card-glass flex flex-col items-center px-6 py-14 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        <p className="mt-4 text-base font-semibold text-foreground">{t('credit.emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('credit.emptyBody')}</p>
      </div>
    );
  }

  const open = notes.filter((n) => n.status === 'open');
  const settled = notes.filter((n) => n.status !== 'open');

  const heading = (note: CreditNoteRow) => (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground break-words">{note.number}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {[note.vendorName, note.date].filter(Boolean).join(' · ')}
      </p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <p className="px-1 text-sm text-muted-foreground">{t('credit.lead')}</p>

      {open.length > 0 && (
        <section aria-labelledby="credit-open" className="space-y-2">
          <h2 id="credit-open" className="section-label px-1">{t('credit.openTitle')}</h2>
          {open.map((note) => (
            <article key={note.id} className="card-glass p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                {heading(note)}
                <p className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{formatMoney(note.amount)}</p>
              </div>

              {note.candidates.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('credit.pickInvoice')}</p>
                  {note.candidates.map((c) => (
                    <button
                      key={c.costEntryId}
                      type="button"
                      disabled={busy === note.id}
                      onClick={() => act(note.id, () => matchCreditNote(note.id, c.costEntryId), 'credit.matched')}
                      className="cta-button-secondary !py-2 !px-3 !text-xs w-full !justify-between disabled:opacity-40"
                    >
                      <span className="truncate">{c.invoiceNumber ?? t('credit.noNumber')}</span>
                      <span className="tabular-nums">{c.date}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('credit.noInvoice')}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  disabled={busy === note.id}
                  onClick={() => act(note.id, () => dismissCreditNote(note.id), 'credit.dismissed')}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
                >
                  {t('credit.dismiss')}
                </button>
                {note.imagePath && (
                  <a
                    href={`/api/images/${note.imagePath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('credit.seeDocument')}
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {settled.length > 0 && (
        <section aria-labelledby="credit-settled" className="space-y-2">
          <h2 id="credit-settled" className="section-label px-1">{t('credit.settledTitle')}</h2>
          <ul className="card-glass divide-y divide-border-subtle overflow-hidden">
            {settled.map((note) => (
              <li key={note.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  {heading(note)}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {note.status === 'matched'
                      ? t('credit.cancelled').replace('{invoice}', note.matched?.invoiceNumber ?? t('credit.noNumber'))
                      : t('credit.setAside')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatMoney(note.amount)}</span>
                  <button
                    type="button"
                    disabled={busy === note.id}
                    onClick={() => act(note.id, () => reopenCreditNote(note.id), 'credit.reopened')}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground underline disabled:opacity-40"
                  >
                    {t('credit.undo')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
