'use client';

import { useState } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/language-context';
import type { SweepOutcome } from '@/lib/invoice-sweep-server';
import { getSweepQueue, runSweep } from '../extraction-actions';

/**
 * Every saved invoice, held to its own figures.
 *
 * One call per invoice, so a long list never hits a request timeout. Unlike the
 * reading proof beside it, this does change the books: it puts right what the
 * figures settle, and sends the rest to the owner.
 */

const NONE: Record<SweepOutcome, number> = { right: 0, fixed: 0, flagged: 0, noFigures: 0 };

export default function InvoiceSweep() {
  const { t } = useLanguage();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [counts, setCounts] = useState<Record<SweepOutcome, number> | null>(null);
  const [changed, setChanged] = useState<Array<{ label: string; outcome: SweepOutcome }>>([]);

  const run = async () => {
    setCounts(null);
    setChanged([]);
    const queue = await getSweepQueue();
    if ('error' in queue) { toast.error(t('proof.sweepFailed')); return; }

    const tally = { ...NONE };
    setProgress({ done: 0, total: queue.data.length });
    for (let i = 0; i < queue.data.length; i++) {
      const item = queue.data[i];
      const result = await runSweep(item.scanId);
      if ('error' in result) {
        toast.error(`${t('proof.sweepFailed')} ${item.label}`);
      } else {
        const { outcome } = result.data;
        tally[outcome]++;
        if (outcome === 'fixed' || outcome === 'flagged') {
          setChanged((was) => [...was, { label: item.label, outcome }]);
        }
      }
      setProgress({ done: i + 1, total: queue.data.length });
    }
    setCounts(tally);
    setProgress(null);
  };

  return (
    <section className="card-glass p-5 space-y-3" aria-labelledby="invoice-sweep">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="invoice-sweep" className="font-bold text-foreground">{t('proof.sweepTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('proof.sweepBody')}</p>
        </div>
        <button type="button" onClick={run} disabled={!!progress} className="cta-button !py-2 !px-4 !text-sm disabled:opacity-40">
          {progress
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <ListChecks className="w-4 h-4" aria-hidden="true" />}
          {progress ? `${progress.done} / ${progress.total}` : t('proof.sweepRun')}
        </button>
      </div>

      {counts && (
        <p className="text-sm font-semibold text-foreground tabular-nums" role="status">
          {t('proof.sweepResult')
            .replace('{right}', String(counts.right))
            .replace('{fixed}', String(counts.fixed))
            .replace('{flagged}', String(counts.flagged))
            .replace('{none}', String(counts.noFigures))}
        </p>
      )}

      {changed.length > 0 && (
        <ul className="divide-y divide-border-subtle text-xs">
          {changed.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
              <span className="min-w-0 font-medium text-foreground">{row.label}</span>
              <span className="text-muted-foreground">{t(`proof.sweep_${row.outcome}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
