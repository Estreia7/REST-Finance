'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { BUCKETS, type Bucket, type PayablesSummary } from '@/lib/payments';
import { getPaymentsSummary } from '../payment-actions';
import type { PayablesFilter } from '../payment-actions';

/**
 * What is owed to suppliers, on the dashboard, always.
 *
 * Leads with what is late, because that is the one that costs a supplier's
 * goodwill. Then the rest, by how soon it falls due, so the owner can see
 * the cash the next weeks will ask for.
 */

/** Urgency fades with distance: red when late, the accent when close. */
const BUCKET_TONE: Record<Bucket, string> = {
  overdue: 'bg-danger',
  week: 'bg-primary',
  fortnight: 'bg-primary/60',
  month: 'bg-primary/35',
  later: 'bg-muted-foreground/25',
};

export function invoiceCount(t: (key: string) => string, n: number) {
  return n === 1 ? t('payments.invoicesOne') : t('payments.invoices').replace('{n}', String(n));
}

/**
 * The open amount laid out by how soon it falls due: one bar, cut in the
 * proportions of each group, and the groups beneath it.
 */
export function PayablesRunway({ summary }: { summary: PayablesSummary }) {
  const { t } = useLanguage();
  const total = summary.open.total;

  return (
    <div>
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-muted mb-3" aria-hidden="true">
          {BUCKETS.map((b) => {
            const share = summary.buckets[b].total / total;
            if (share <= 0) return null;
            return <span key={b} className={`${BUCKET_TONE[b]} h-full`} style={{ width: `${share * 100}%` }} />;
          })}
        </div>
      )}
      <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {BUCKETS.map((b) => {
          const tally = summary.buckets[b];
          const late = b === 'overdue' && tally.count > 0;
          return (
            <div
              key={b}
              className={`rounded-lg px-3 py-2.5 ${late ? 'bg-danger/10' : 'bg-muted'} ${b === 'overdue' ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className={`w-2 h-2 rounded-full shrink-0 ${BUCKET_TONE[b]}`} aria-hidden="true" />
                {t(`payments.bucket_${b}`)}
              </dt>
              <dd className={`mt-1 text-base font-bold tabular-nums ${late ? 'text-danger' : 'text-foreground'}`}>
                {formatMoney(tally.total)}
              </dd>
              <dd className="text-[11px] text-muted-foreground tabular-nums">
                {invoiceCount(t, tally.count)}
              </dd>
            </div>
          );
        })}
      </dl>
      {summary.scheduled.count > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          {t('payments.scheduledNote').replace('{amount}', formatMoney(summary.scheduled.total))}
        </p>
      )}
    </div>
  );
}

export default function PayablesCard({
  refreshKey,
  onOpen,
}: {
  /** Bumped by the dashboard after any save. */
  refreshKey?: number;
  onOpen: (filter: PayablesFilter) => void;
}) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<PayablesSummary | null>(null);

  useEffect(() => {
    let stale = false;
    getPaymentsSummary().then((r) => {
      if (!stale && 'data' in r && r.data) setSummary(r.data.summary);
    });
    return () => { stale = true; };
  }, [refreshKey]);

  if (!summary) return null;

  const overdue = summary.overdue;
  const headline = overdue.count === 0
    ? t('payments.noneOverdue')
    : overdue.count === 1
      ? t('payments.overdueHeadlineOne')
      : t('payments.overdueHeadline').replace('{n}', String(overdue.count));

  return (
    <section className="card-glass p-5 sm:p-6" aria-labelledby="payables-title">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="payables-title" className="text-sm font-semibold text-muted-foreground">
            {t('payments.cardTitle')}
          </h2>
          <button
            type="button"
            onClick={() => onOpen('open')}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline
                       rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('payments.openPayments')}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onOpen(overdue.count > 0 ? 'overdue' : 'open')}
          className={`mt-1.5 flex flex-wrap items-baseline gap-x-2 text-left text-lg sm:text-xl font-bold rounded-md
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                     ${overdue.count > 0 ? 'text-danger' : 'text-foreground'}`}
        >
          <span className="flex items-center gap-1.5">
            {overdue.count > 0
              ? <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              : <CheckCircle2 className="w-5 h-5 shrink-0 text-success" aria-hidden="true" />}
            {headline}
          </span>
          {overdue.count > 0 && <span className="tabular-nums">· {formatMoney(overdue.total)}</span>}
        </button>
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          {summary.open.count > 0
            ? t('payments.openTotal').replace('{amount}', formatMoney(summary.open.total))
            : t('payments.nothingOpen')}
        </p>
      </div>

      {summary.open.count > 0 && <PayablesRunway summary={summary} />}
    </section>
  );
}
