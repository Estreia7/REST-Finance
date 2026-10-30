'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Package, Search, ClipboardList, ShoppingCart, Loader2, Copy, Mail, Sparkles, Check } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { formatMoneyExact } from '@/lib/format';
import { normaliseName } from '@/lib/onboarding';
import type { ItemSuggestion } from '@/lib/stock';
import SubTabs from './SubTabs';
import {
  getStockOverview, getStockSuggestions, addStockItems, updateStockItem, saveStockCount, type StockRow,
} from '../stock-actions';

/**
 * Stock: what is in the house, what it is worth, and what to order.
 *
 * Items come from what the restaurant already buys; purchases arrive by
 * themselves from invoices. The owner counts, and sets a minimum where it
 * matters; the order is drafted per supplier from those minimums.
 */

type View = 'items' | 'count' | 'order';

const qty = (n: number | null, unit: string) =>
  n === null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')}${unit ? ` ${unit}` : ''}`;

export default function StockPanel() {
  const { t, language } = useLanguage();
  const [view, setView] = useState<View>('items');
  const [data, setData] = useState<Awaited<ReturnType<typeof getStockOverview>> | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const load = useCallback(async () => setData(await getStockOverview()), []);
  useEffect(() => { load(); }, [load]);

  if (!data) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('common.loading')}</div>;
  }
  if (!data.success) return <p className="text-sm text-muted-foreground">{translateError(language, data.error)}</p>;

  const { rows, summary } = data.data;

  if (rows.length === 0 || suggesting) {
    return <Suggestions empty={rows.length === 0} onDone={() => { setSuggesting(false); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="card-glass grid gap-4 p-5 sm:grid-cols-4 sm:p-6">
        <Figure label={t('stock.value')} value={formatMoneyExact(summary.value)} />
        <Figure label={t('stock.items')} value={String(summary.items)} />
        <Figure label={t('stock.toOrder')} value={String(summary.toOrder)} />
        <Figure
          label={t('stock.lastCount')}
          value={summary.lastCountAt
            ? new Date(`${summary.lastCountAt}T00:00:00Z`).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
            : t('stock.never')}
        />
        {summary.neverCounted > 0 && (
          <p className="text-xs text-muted-foreground sm:col-span-4">
            {t('stock.neverCountedHint').replace('{count}', String(summary.neverCounted))}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubTabs
          label={t('stock.title')}
          active={view}
          onChange={setView}
          tabs={[
            { value: 'items', label: t('stock.tabItems') },
            { value: 'count', label: t('stock.tabCount') },
            { value: 'order', label: `${t('stock.tabOrder')}${summary.toOrder ? ` (${summary.toOrder})` : ''}` },
          ]}
        />
        {view === 'items' && (
          <button type="button" onClick={() => setSuggesting(true)} className="cta-button-secondary !py-2 !px-3 !text-xs">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{t('stock.suggestMore')}
          </button>
        )}
      </div>

      {view === 'items' && <Items rows={rows} onChanged={load} />}
      {view === 'count' && <Count rows={rows} onSaved={() => { load(); setView('items'); }} />}
      {view === 'order' && <Order rows={rows} />}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function useSearch<T extends { name: string }>(rows: T[]) {
  const [search, setSearch] = useState('');
  const term = normaliseName(search);
  const filtered = useMemo(() => (term ? rows.filter((r) => normaliseName(r.name).includes(term)) : rows), [rows, term]);
  return { search, setSearch, filtered };
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input className="input-field !py-2 !pl-9" placeholder={t('stock.search')} aria-label={t('stock.search')} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Products bought recently, ticked by default for the top ones; added in one go. */
function Suggestions({ empty, onDone }: { empty: boolean; onDone: () => void }) {
  const { t, language } = useLanguage();
  const [list, setList] = useState<ItemSuggestion[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getStockSuggestions().then((r) => {
      if (!r.success) { toast.error(translateError(language, r.error)); setList([]); return; }
      setList(r.data);
      setChosen(new Set(r.data.slice(0, 25).map((_, i) => i)));
    });
  }, [language]);

  const add = async () => {
    if (!list) return;
    setBusy(true);
    const r = await addStockItems(list.filter((_, i) => chosen.has(i)));
    setBusy(false);
    if (!r.success) return toast.error(translateError(language, r.error));
    toast.success(t('stock.added').replace('{count}', String(r.data.added)));
    onDone();
  };

  return (
    <div className="card-glass p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary-ink" aria-hidden="true" />
        <h2 className="text-lg font-bold text-foreground">{t(empty ? 'stock.emptyTitle' : 'stock.suggestTitle')}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('stock.suggestLead')}</p>
      {list === null && <p className="mt-6 text-sm text-muted-foreground">{t('common.loading')}</p>}
      {list?.length === 0 && <p className="mt-6 text-sm text-muted-foreground">{t('stock.noSuggestions')}</p>}
      {list && list.length > 0 && (
        <>
          <ul className="mt-5 max-h-[420px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {list.map((s, i) => (
              <li key={`${s.normalizedName}|${s.unit}`}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={chosen.has(i)}
                    onChange={(e) => setChosen((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{s.name}{s.unit ? <span className="text-muted-foreground"> · {s.unit}</span> : null}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.vendorName ?? '—'} · {t('stock.purchases').replace('{count}', String(s.purchases))}</span>
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatMoneyExact(s.spend)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {!empty && <button type="button" onClick={onDone} className="cta-button-secondary !py-2 !px-4">{t('common.cancel')}</button>}
            <button type="button" onClick={add} disabled={busy || chosen.size === 0} className="cta-button !py-2 !px-4">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {t('stock.addChosen').replace('{count}', String(chosen.size))}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Items({ rows, onChanged }: { rows: StockRow[]; onChanged: () => void }) {
  const { t, language } = useLanguage();
  const { search, setSearch, filtered } = useSearch(rows);

  const saveMin = async (row: StockRow, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (value !== null && !Number.isFinite(value)) return;
    if (value === row.minQuantity) return;
    const r = await updateStockItem({ id: row.id, minQuantity: value });
    if (!r.success) toast.error(translateError(language, r.error));
    else onChanged();
  };

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} />
      <div className="card-glass overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('stock.colItem')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('stock.colOnHand')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('stock.colMin')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('stock.colCost')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('stock.colValue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5">
                  <span className="block text-foreground">{r.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {r.vendorName ?? '—'}
                    {r.essential && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary-ink">{t('stock.essential')}</span>}
                    {r.toOrder > 0 && <span className="rounded-full bg-danger/10 px-1.5 py-px text-[10px] font-semibold text-danger">{t('stock.belowMin')}</span>}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{qty(r.onHand, r.unit)}</td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    defaultValue={r.minQuantity ?? ''}
                    placeholder="—"
                    inputMode="decimal"
                    aria-label={`${t('stock.colMin')} — ${r.name}`}
                    onBlur={(e) => saveMin(r, e.target.value)}
                    className="w-20 rounded-lg border border-border bg-card px-2 py-1 text-right tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.averageCost !== null ? formatMoneyExact(r.averageCost) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.value !== null ? formatMoneyExact(r.value) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Count({ rows, onSaved }: { rows: StockRow[]; onSaved: () => void }) {
  const { t, language } = useLanguage();
  const [kind, setKind] = useState<'FULL' | 'ESSENTIAL' | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const essential = rows.filter((r) => r.essential);
  const list = kind === 'ESSENTIAL' ? essential : rows;
  const { search, setSearch, filtered } = useSearch(list);

  if (!kind) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {([['FULL', rows.length], ['ESSENTIAL', essential.length]] as const).map(([k, n]) => (
          <button
            key={k}
            type="button"
            disabled={n === 0}
            onClick={() => setKind(k)}
            className="card-glass flex items-start gap-3 p-5 text-left hover:border-primary disabled:opacity-50"
          >
            <ClipboardList className="mt-0.5 h-5 w-5 text-primary-ink" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-foreground">{t(`stock.count${k === 'FULL' ? 'Full' : 'Essential'}`)} · {n}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(`stock.count${k === 'FULL' ? 'Full' : 'Essential'}Hint`)}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  const save = async () => {
    const lines = Object.entries(values)
      .filter(([, v]) => v.trim() !== '')
      .map(([itemId, v]) => ({ itemId, quantity: Number(v.replace(',', '.')) }))
      .filter((l) => Number.isFinite(l.quantity));
    setBusy(true);
    const r = await saveStockCount({ kind, lines });
    setBusy(false);
    if (!r.success) return toast.error(translateError(language, r.error));
    toast.success(
      r.data.measured > 0
        ? t('stock.countSavedUsage').replace('{count}', String(r.data.saved)).replace('{amount}', formatMoneyExact(r.data.usedCost))
        : t('stock.countSaved').replace('{count}', String(r.data.saved)),
    );
    if (r.data.gaps.length > 0) toast.warning(t('stock.countGaps').replace('{items}', r.data.gaps.join(', ')));
    onSaved();
  };

  const filled = Object.values(values).filter((v) => v.trim() !== '').length;

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} />
      <ul className="card-glass divide-y divide-border">
        {filtered.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <label htmlFor={`count-${r.id}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{r.name}</span>
              <span className="block text-xs text-muted-foreground">{t('stock.expected')}: {qty(r.onHand, r.unit)}</span>
            </label>
            <input
              id={`count-${r.id}`}
              inputMode="decimal"
              value={values[r.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))}
              placeholder="—"
              className="w-24 rounded-lg border border-border bg-input px-2 py-1.5 text-right tabular-nums"
            />
            <span className="w-8 text-xs text-muted-foreground">{r.unit}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => { setKind(null); setValues({}); }} className="cta-button-secondary !py-2 !px-4">{t('common.back')}</button>
        <button type="button" onClick={save} disabled={busy || filled === 0} className="cta-button !py-2 !px-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {t('stock.saveCount').replace('{count}', String(filled))}
        </button>
      </div>
    </div>
  );
}

/** Below-minimum items, per supplier, ready to copy or email. */
function Order({ rows }: { rows: StockRow[] }) {
  const { t } = useLanguage();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const due = rows.filter((r) => r.toOrder > 0);

  if (due.length === 0) {
    return (
      <div className="card-glass px-6 py-12 text-center">
        <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-foreground">{t('stock.nothingToOrder')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('stock.nothingToOrderHint')}</p>
      </div>
    );
  }

  const groups = new Map<string, StockRow[]>();
  for (const r of due) {
    const k = r.vendorName ?? t('stock.noSupplier');
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const amount = (r: StockRow) => overrides[r.id] ?? String(r.toOrder);
  const message = (supplier: string, items: StockRow[]) => [
    t('stock.orderGreeting'),
    '',
    ...items.map((r) => `- ${r.name}: ${amount(r)}${r.unit ? ` ${r.unit}` : ''}`),
    '',
    t('stock.orderThanks'),
  ].join('\n');

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([supplier, items]) => (
        <section key={supplier} className="card-glass p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{supplier}</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="cta-button-secondary !py-1.5 !px-3 !text-xs"
                onClick={async () => { try { await navigator.clipboard.writeText(message(supplier, items)); toast.success(t('invoiceEmail.copied')); } catch { /* nothing */ } }}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />{t('stock.copyOrder')}
              </button>
              <a
                className="cta-button !py-1.5 !px-3 !text-xs"
                href={`mailto:?subject=${encodeURIComponent(t('stock.orderSubject'))}&body=${encodeURIComponent(message(supplier, items))}`}
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />{t('stock.emailOrder')}
              </a>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('stock.orderWhy').replace('{onHand}', qty(r.onHand, r.unit)).replace('{min}', qty(r.minQuantity, r.unit))}
                  </span>
                </span>
                <input
                  inputMode="decimal"
                  aria-label={`${t('stock.tabOrder')} — ${r.name}`}
                  value={amount(r)}
                  onChange={(e) => setOverrides((o) => ({ ...o, [r.id]: e.target.value }))}
                  className="w-20 rounded-lg border border-border bg-input px-2 py-1 text-right tabular-nums"
                />
                <span className="w-8 text-xs text-muted-foreground">{r.unit}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
