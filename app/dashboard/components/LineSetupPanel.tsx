'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { getLinesToSetup, type LineSetupData } from '../line-setup-actions';
import LineSetupCard from './LineSetupCard';

/**
 * The lines waiting to be explained, one card at a time, most money first.
 *
 * One at a time because this is done between other things: an owner who
 * answers the first three has dealt with most of the money, and "later" moves
 * on without losing anything.
 */
export default function LineSetupPanel({ embedded = false, onChanged }: {
  /** Inside "Precisa de ti", which says itself when nothing is left. */
  embedded?: boolean;
  /** An answer was saved, so counts shown elsewhere are out of date. */
  onChanged?: () => void;
}) {
  const { t } = useLanguage();
  const [data, setData] = useState<LineSetupData | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);

  const load = useCallback(() => {
    getLinesToSetup().then((result) => {
      if ('error' in result) setFailed(true);
      else setData(result.data);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (failed) return <p className="text-sm text-muted-foreground">{t('lineSetup.failed')}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }

  const total = data.lines.length;
  if (total === 0) {
    if (embedded) return null;
    return (
      <div className="card-glass flex flex-col items-center px-6 py-14 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
        <p className="mt-4 text-base font-semibold text-foreground">{t('lineSetup.emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('lineSetup.emptyBody')}</p>
      </div>
    );
  }

  const current = Math.min(index, total - 1);
  const line = data.lines[current];
  const waiting = data.lines.reduce((sum, l) => sum + l.spent, 0);

  return (
    <div className={embedded ? 'space-y-3' : 'max-w-2xl mx-auto space-y-3'}>
      <div className="px-1">
        <p className="text-sm text-muted-foreground">{t('lineSetup.lead')}</p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {t('lineSetup.progress')
            .replace('{current}', String(current + 1))
            .replace('{total}', String(total))
            .replace('{amount}', formatMoney(waiting))}
        </p>
      </div>
      <div className="card-glass p-5 sm:p-6">
        <LineSetupCard
          key={line.key}
          line={line}
          ingredients={data.ingredients}
          categories={data.categories}
          onSaved={() => { load(); onChanged?.(); }}
          onCorrected={load}
          onLater={total > 1 ? () => setIndex((current + 1) % total) : undefined}
        />
      </div>
    </div>
  );
}
