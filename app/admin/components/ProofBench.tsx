'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { getProofBenchQueue, runProofBench, type ProofBenchRow } from '../extraction-actions';

/**
 * Today's reader against the invoices already stored, measured by their QR.
 *
 * Saves nothing to the books: it says how the old reading and the new one fare,
 * so a change of prompt or model is judged by a number. Each document is its
 * own call, so a long list never hits a request timeout.
 */
export default function ProofBench() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<ProofBenchRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const run = async () => {
    setRows([]);
    const queue = await getProofBenchQueue();
    if ('error' in queue) { toast.error(t('proof.benchFailed')); return; }
    setProgress({ done: 0, total: queue.data.length });
    for (let i = 0; i < queue.data.length; i++) {
      const result = await runProofBench(queue.data[i]);
      if ('error' in result) toast.error(`${t('proof.benchFailed')} ${queue.data[i].label}`);
      else setRows((was) => [...was, result.data]);
      setProgress({ done: i + 1, total: queue.data.length });
    }
    setProgress(null);
  };

  const proved = rows.filter((r) => r.after === 'proved').length;
  const before = rows.filter((r) => r.before === 'proved').length;

  return (
    <section className="card-glass p-5 space-y-3" aria-labelledby="proof-bench">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="proof-bench" className="font-bold text-foreground">{t('proof.benchTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('proof.benchBody')}</p>
        </div>
        <button type="button" onClick={run} disabled={!!progress} className="cta-button !py-2 !px-4 !text-sm disabled:opacity-40">
          {progress
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <ShieldCheck className="w-4 h-4" aria-hidden="true" />}
          {progress ? `${progress.done} / ${progress.total}` : t('proof.benchRun')}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {t('proof.benchResult')
              .replace('{before}', String(before))
              .replace('{after}', String(proved))
              .replace('{total}', String(rows.length))}
          </p>
          <ul className="divide-y divide-border-subtle text-xs">
            {rows.map((row) => (
              <li key={row.scanId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="min-w-0 font-medium text-foreground">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {t(`proof.status.${row.before}`)} → <strong className="text-foreground">{t(`proof.status.${row.after}`)}</strong>
                  {row.gap !== 0 ? ` · ${formatMoney(row.gap)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
