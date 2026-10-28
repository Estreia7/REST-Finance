'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getDuplicateCosts, mergeDuplicateCosts } from '../payment-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

type Pair = Extract<Awaited<ReturnType<typeof getDuplicateCosts>>, { data: unknown }>['data'][number];

/**
 * Purchases counted twice: an old cost and the invoice it really is.
 *
 * The old scanner kept a purchase as one cost with its products in the
 * description; the same paper scanned again since is a proper invoice. Both
 * count, in what is owed and in the P&L. Listed here so they can be joined
 * in one go, pre-ticked like the ingredients below: they are proposed because
 * the products match, and an owner who agrees should not tick each one.
 *
 * Shows nothing when there is nothing to join, so the tidy tab does not grow
 * an empty card for a problem most restaurants never had.
 */
export default function DuplicateCosts({ onMerged }: { onMerged?: () => void }) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getDuplicateCosts().then((result) => {
      const data = 'data' in result && result.data ? result.data : [];
      setPairs(data);
      setChosen(new Set(data.map((p) => p.orphanId)));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!pairs || pairs.length === 0) return null;

  const date = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
    });
  const total = pairs.filter((p) => chosen.has(p.orphanId)).reduce((s, p) => s + p.old.amount, 0);

  const merge = async () => {
    setBusy(true);
    const result = await mergeDuplicateCosts({
      pairs: pairs
        .filter((p) => chosen.has(p.orphanId))
        .map((p) => ({ duplicateId: p.orphanId, invoiceId: p.invoiceId })),
    });
    setBusy(false);
    if ('error' in result) {
      toast.error(t(result.error ?? 'errors.write'));
      return;
    }
    toast.success(t('payments.mergedMany').replace('{n}', String(result.data.merged)));
    load();
    onMerged?.();
  };

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-1">{t('payments.duplicatesTitle')}</h3>
      <p className="text-xs text-muted-foreground mb-5 max-w-prose">{t('payments.duplicatesBody')}</p>

      <ul className="space-y-2 mb-5">
        {pairs.map((pair) => (
          <li key={pair.orphanId}>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-border-subtle bg-surface cursor-pointer">
              <input
                type="checkbox"
                checked={chosen.has(pair.orphanId)}
                onChange={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (next.has(pair.orphanId)) next.delete(pair.orphanId);
                    else next.add(pair.orphanId);
                    return next;
                  })
                }
                className="mt-0.5 w-4 h-4 rounded border-border accent-primary shrink-0"
              />
              <span className="min-w-0 text-sm">
                <span className="block text-muted-foreground [overflow-wrap:anywhere] line-clamp-2">
                  <span className="tabular-nums">{date(pair.old.dateKey)}</span>
                  {' · '}
                  <span className="tabular-nums">{formatMoney(pair.old.amount, { decimals: 2 })}</span>
                  {pair.old.description ? ` · ${pair.old.description}` : ''}
                </span>
                <span className="block mt-1 text-foreground">
                  <span className="text-muted-foreground">→ </span>
                  <span className="font-semibold [overflow-wrap:anywhere]">
                    {pair.invoiceNumber ?? t('payments.duplicateNoNumber')}
                  </span>
                  {pair.vendorName && <span className="text-muted-foreground"> · {pair.vendorName}</span>}
                  <span className="text-muted-foreground tabular-nums"> · {date(pair.dateKey)}</span>
                </span>
                <span className="block mt-0.5 text-[11px] text-muted-foreground">
                  {t('payments.duplicateMatched')
                    .replace('{n}', String(pair.matched))
                    .replace('{total}', String(pair.lines))}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-4">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>{t('payments.duplicatesWarning')}</span>
      </p>

      <button
        type="button"
        onClick={merge}
        disabled={busy || chosen.size === 0}
        className="cta-button !py-2 !px-4 !text-sm"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {t('payments.mergeSelected')
          .replace('{n}', String(chosen.size))
          .replace('{amount}', formatMoney(total, { decimals: 2 }))}
      </button>
    </div>
  );
}
