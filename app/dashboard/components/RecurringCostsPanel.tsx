'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Repeat, Pencil, Check, X, Loader2, CircleStop } from 'lucide-react';
import { listRecurringCosts, updateRecurringCostAmount, stopRecurringCost } from '../recurring-cost-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

/**
 * The fixed monthly costs still running, under the form that creates them.
 *
 * Two things an owner does with one: change what it costs from now on (the
 * internet went up), or stop it (the contract ended early). Neither touches
 * the months already booked — those were paid.
 *
 * Renders nothing until there is at least one, so the cost form is not
 * followed by an empty card explaining a feature nobody has used yet.
 */

interface RecurringCost {
  id: string;
  type: 'COGS' | 'OPEX';
  categoryName: string | null;
  description: string | null;
  amount: number;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextDate: string | null;
}

export default function RecurringCostsPanel({
  refreshKey,
  onChanged,
}: {
  /** Bumped by the dashboard after any save, so a new fixed cost appears here. */
  refreshKey?: number;
  /** After a change, so the dashboard's figures follow. */
  onChanged?: () => void;
}) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<RecurringCost[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);

  const load = useCallback(() => {
    listRecurringCosts().then((r) => {
      if (r.success) setItems(r.data);
    });
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (items.length === 0) return null;

  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const shortDate = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthYear = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });

  const saveAmount = async (id: string) => {
    const amount = parseFloat(draft.replace(',', '.'));
    setBusyId(id);
    const r = await updateRecurringCostAmount(id, amount);
    setBusyId(null);
    if (!r.success) {
      toast.error(t(r.error));
      return;
    }
    toast.success(t('recurring.amountUpdated'));
    setEditingId(null);
    load();
    onChanged?.();
  };

  const stop = async (id: string) => {
    setBusyId(id);
    const r = await stopRecurringCost(id);
    setBusyId(null);
    setConfirmStopId(null);
    if (!r.success) {
      toast.error(t(r.error));
      return;
    }
    toast.success(t('recurring.stopped'));
    load();
    onChanged?.();
  };

  const monthlyTotal = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="max-w-2xl mt-5">
      <div className="card-glass p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Repeat className="w-4 h-4 text-primary-ink" aria-hidden="true" />
            {t('recurring.title')}
          </h2>
          <span className="text-right">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('recurring.perMonth')}</span>
            <span className="block text-base font-bold text-foreground tabular-nums">{formatMoney(monthlyTotal, { decimals: 2 })}</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t('recurring.panelHint')}</p>

        <ul className="-mx-6 md:-mx-8 divide-y divide-border-subtle border-t border-border-subtle">
          {items.map((item) => {
            const editing = editingId === item.id;
            const busy = busyId === item.id;
            const title = item.description?.trim() || item.categoryName || t(item.type === 'COGS' ? 'owner.costForm.cogs' : 'owner.costForm.opex');
            return (
              <li key={item.id} className="px-6 md:px-8 py-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.categoryName && item.description ? `${item.categoryName} · ` : ''}
                      {t('recurring.everyMonthOn')} {item.dayOfMonth}
                      {' · '}
                      {item.endDate
                        ? `${t('recurring.until')} ${monthYear(item.endDate)}`
                        : t('recurring.noEndShort')}
                      {item.nextDate && <> · {t('recurring.next')} {shortDate(item.nextDate)}</>}
                    </p>
                  </div>

                  {editing ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); saveAmount(item.id); }}
                      className="flex items-center gap-1.5"
                    >
                      <span className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                        <input
                          type="number" step="0.01" min="0.01" inputMode="decimal"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          aria-label={t('recurring.newAmount')}
                          className="input-field !py-1.5 !pl-6 !text-sm w-28"
                          autoFocus
                        />
                      </span>
                      <button type="submit" disabled={busy} className="cta-button !py-1.5 !px-2.5 !text-xs" aria-label={t('common.save')}>
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label={t('common.cancel')}>
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-foreground tabular-nums mr-1">
                        {formatMoney(item.amount, { decimals: 2 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(item.id); setDraft(String(item.amount)); setConfirmStopId(null); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label={`${t('recurring.changeAmount')} — ${title}`}
                        title={t('recurring.changeAmount')}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => (confirmStopId === item.id ? stop(item.id) : setConfirmStopId(item.id))}
                        disabled={busy}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors
                          ${confirmStopId === item.id
                            ? 'bg-danger text-white'
                            : 'text-muted-foreground hover:text-danger hover:bg-muted'}`}
                        aria-label={`${t('recurring.stop')} — ${title}`}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <CircleStop className="w-3.5 h-3.5" aria-hidden="true" />}
                        {confirmStopId === item.id ? t('recurring.confirmStop') : t('recurring.stop')}
                      </button>
                    </div>
                  )}
                </div>
                {editing && <p className="mt-1.5 text-[11px] text-muted-foreground">{t('recurring.amountHint')}</p>}
                {confirmStopId === item.id && <p className="mt-1.5 text-[11px] text-muted-foreground">{t('recurring.stopHint')}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
