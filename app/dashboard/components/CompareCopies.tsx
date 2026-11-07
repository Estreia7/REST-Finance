'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { recommendedCopy } from '@/lib/review-queue';
import { keepQueuedCopy, type InvoiceToReview } from '../invoice-email-actions';
import Dialog from './Dialog';
import ZoomableImage from './ZoomableImage';

/**
 * Photographs of one invoice side by side, to keep the better one.
 *
 * The app says which one adds up and may suggest it, but the owner has the paper
 * in hand: whichever they keep stays, and the others leave the list. The figures
 * and the button come first, because a page photographed whole fills the screen.
 */
export default function CompareCopies({ copies, onKept, onClose }: {
  copies: InvoiceToReview[];
  onKept: (keptId: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [keeping, setKeeping] = useState<string | null>(null);
  const suggested = recommendedCopy(copies);

  const keep = async (id: string) => {
    setKeeping(id);
    const result = await keepQueuedCopy(id);
    setKeeping(null);
    if ('error' in result) {
      toast.error(t('compareCopies.failed'));
      return;
    }
    toast.success(t('compareCopies.kept'));
    onKept(id);
  };

  const status = (copy: InvoiceToReview) => {
    if (copy.proofStatus === 'proved') return { text: t('compareCopies.adds'), tone: 'text-success' };
    if (copy.proofStatus === 'failed') return { text: t('compareCopies.doesNotAdd'), tone: 'text-warning' };
    return { text: t('compareCopies.unchecked'), tone: 'text-muted-foreground' };
  };

  return (
    <Dialog wide title={t('compareCopies.title')} onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-4">{t('compareCopies.lead')}</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {copies.map((copy, i) => {
          const { text, tone } = status(copy);
          const total = (copy.data as { grandTotal?: number } | null)?.grandTotal;
          return (
            <li key={copy.id} className="min-w-0 flex flex-col gap-3 rounded-xl border border-border-subtle p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {t('compareCopies.photo').replace('{n}', String(i + 1))}
                </span>
                {copy.id === suggested && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    {t('compareCopies.suggested')}
                  </span>
                )}
              </div>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('compareCopies.total')}</dt>
                  <dd className="font-semibold text-foreground tabular-nums">
                    {typeof total === 'number' ? formatMoney(total, { decimals: 2 }) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('compareCopies.figures')}</dt>
                  <dd className={`font-medium text-right ${tone}`}>{text}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => keep(copy.id)}
                disabled={keeping !== null}
                className={`${copy.id === suggested ? 'cta-button' : 'cta-button-secondary'} !py-2 !px-4 !text-sm w-full`}
              >
                {keeping === copy.id
                  ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  : <Check className="w-4 h-4" aria-hidden="true" />}
                {t('compareCopies.keep')}
              </button>
              <div className="space-y-2">
                {copy.pages.map((path) => (
                  <ZoomableImage
                    key={path}
                    src={`/api/images/${path}`}
                    alt={t('scanIssues.pictureAlt')}
                    className="w-full rounded-lg border border-border-subtle"
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
