'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Loader2, Check, Wand2, Search, Undo2, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { formatMoneyExact } from '@/lib/format';
import {
  getBankView, importBankStatement, confirmBankMatch, autoReconcile, setBankIgnored,
  undoBankMatch, bookBankFees, getMatchCandidates,
  type BankFilter, type BankRow, type CostLabel,
} from '../bank-actions';

/**
 * Contabilidade › Banco: the bank statement against the invoices.
 *
 * The owner imports the bank's own export; each payment shows the invoice it
 * most likely paid, to confirm with one tap, or to pick by hand. Certain
 * matches can all be confirmed at once. Bank charges can be booked as an
 * expense, and anything that is not an invoice payment set aside.
 */

const FILTERS: BankFilter[] = ['open', 'matched', 'ignored', 'all'];

function dayLabel(key: string, language: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  });
}

export default function BankPanel() {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<BankFilter>('open');
  const [data, setData] = useState<Awaited<ReturnType<typeof getBankView>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setData(await getBankView(filter));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const err = (e: string | undefined) => toast.error(translateError(language, e));

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.success) return err(r.error);
    if (ok) toast.success(ok);
    setPicking(null);
    load();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy('import');
    const r = await importBankStatement(form);
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
    if (!r.success) return err(r.error);
    toast.success(
      t('bank.imported')
        .replace('{added}', String(r.data.added))
        .replace('{already}', String(r.data.alreadyThere)),
    );
    setFilter('open');
    load();
  };

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('common.loading')}
      </div>
    );
  }
  if (!data.success) return <p className="text-sm text-muted-foreground">{translateError(language, data.error)}</p>;

  const { rows, summary } = data.data;
  const nothingYet = summary.open.count + summary.matched.count + summary.ignored.count === 0;
  const done = summary.matched.count;
  const total = done + summary.open.count;
  const openFeeIds = rows.filter((r) => r.status === 'OPEN' && r.kind === 'FEE').map((r) => r.id);

  const importButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.ofx,.qfx"
        className="sr-only"
        aria-label={t('bank.import')}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button type="button" className="cta-button !py-2 !px-4" disabled={busy === 'import'} onClick={() => fileRef.current?.click()}>
        {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {t('bank.import')}
      </button>
    </>
  );

  if (nothingYet) {
    return (
      <div className="card-glass flex flex-col items-center px-6 py-14 text-center">
        <p className="text-base font-semibold text-foreground">{t('bank.emptyTitle')}</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t('bank.emptyBody')}</p>
        <div className="mt-6">{importButton}</div>
        <p className="mt-3 text-xs text-muted-foreground">{t('bank.formats')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-glass p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('bank.toReconcile')}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{formatMoneyExact(Math.abs(summary.openPayments.total))}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('bank.progress').replace('{done}', String(done)).replace('{total}', String(total))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {summary.autoCount > 0 && (
              <button
                type="button"
                className="cta-button-secondary !py-2 !px-4"
                disabled={busy === 'auto'}
                onClick={() => run('auto', async () => {
                  const r = await autoReconcile();
                  if (r.success) toast.success(t('bank.autoDone').replace('{count}', String(r.data.matched)));
                  return r;
                })}
              >
                {busy === 'auto' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
                {t('bank.auto').replace('{count}', String(summary.autoCount))}
              </button>
            )}
            {importButton}
          </div>
        </div>
        {total > 0 && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className="h-full rounded-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
          </div>
        )}
        {summary.openFees.count > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              {t('bank.feesLine')
                .replace('{count}', String(summary.openFees.count))
                .replace('{amount}', formatMoneyExact(Math.abs(summary.openFees.total)))}
            </p>
            {openFeeIds.length > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-primary-ink hover:underline"
                disabled={busy === 'fees'}
                onClick={() => run('fees', () => bookBankFees(openFeeIds), t('bank.feesBooked'))}
              >
                {t('bank.bookFees')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1 w-fit" role="tablist" aria-label={t('bank.filterLabel')}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t(`bank.filters.${f}`)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="card-glass px-5 py-10 text-center text-sm text-muted-foreground">{t('bank.noneHere')}</p>
      ) : (
        <ul className="card-glass divide-y divide-border overflow-hidden">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3.5 sm:px-5">
              <Row
                row={row}
                busy={busy}
                picking={picking === row.id}
                onPick={() => setPicking(picking === row.id ? null : row.id)}
                onConfirm={(ids) => run(row.id, () => confirmBankMatch({ transactionId: row.id, costIds: ids }), t('bank.confirmed'))}
                onIgnore={(ignored) => run(row.id, () => setBankIgnored({ transactionId: row.id, ignored }))}
                onUndo={() => run(row.id, () => undoBankMatch(row.id))}
                onBookFee={() => run(row.id, () => bookBankFees([row.id]), t('bank.feesBooked'))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CostLine({ c }: { c: CostLabel }) {
  const { t, language } = useLanguage();
  return (
    <span className="min-w-0">
      <span className="font-medium text-foreground">{c.invoiceNumber || c.description || t('bank.noNumber')}</span>
      <span className="text-muted-foreground">
        {' · '}{c.vendorName || t('bank.noVendor')}{' · '}{dayLabel(c.dateKey, language)}{' · '}
        <span className="tabular-nums">{formatMoneyExact(c.amount)}</span>
        {c.restaurantName ? ` · ${c.restaurantName}` : ''}
      </span>
    </span>
  );
}

function Row({
  row, busy, picking, onPick, onConfirm, onIgnore, onUndo, onBookFee,
}: {
  row: BankRow;
  busy: string | null;
  picking: boolean;
  onPick: () => void;
  onConfirm: (ids: string[]) => void;
  onIgnore: (ignored: boolean) => void;
  onUndo: () => void;
  onBookFee: () => void;
}) {
  const { t, language } = useLanguage();
  const working = busy === row.id;
  const link = 'text-xs font-semibold text-primary-ink hover:underline disabled:opacity-50';
  const quiet = 'text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50';

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{dayLabel(row.dateKey, language)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground" title={row.description}>{row.description}</span>
          {row.kind !== 'PAYMENT' && (
            <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {t(`bank.kinds.${row.kind}`)}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${row.amount > 0 ? 'text-success' : 'text-foreground'}`}>
          {row.amount > 0 ? '+' : '−'}{formatMoneyExact(Math.abs(row.amount))}
        </span>
      </div>

      <div className="pl-[4.25rem] text-xs">
        {row.status === 'MATCHED' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            <span className="text-muted-foreground">{t(row.kind === 'FEE' ? 'bank.bookedAsFee' : 'bank.paid')}</span>
            {row.kind !== 'FEE' && row.matched.map((c) => <CostLine key={c.id} c={c} />)}
            <button type="button" className={quiet} disabled={working} onClick={onUndo}>
              <Undo2 className="mr-1 inline h-3 w-3" aria-hidden="true" />{t('bank.undo')}
            </button>
          </div>
        )}

        {row.status === 'IGNORED' && (
          <button type="button" className={quiet} disabled={working} onClick={() => onIgnore(false)}>{t('bank.restore')}</button>
        )}

        {row.status === 'OPEN' && row.kind === 'PAYMENT' && (
          <div className="space-y-2">
            {row.suggestion ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  row.suggestion.confidence === 'certain' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                }`}>
                  {t(`bank.confidence.${row.suggestion.confidence}`)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {row.suggestion.costs.map((c) => <CostLine key={c.id} c={c} />)}
                </span>
                <button
                  type="button"
                  className="cta-button !py-1.5 !px-3 !text-xs"
                  disabled={working}
                  onClick={() => onConfirm(row.suggestion!.costIds)}
                >
                  {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {t('bank.confirm')}
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground">{t('bank.noSuggestion')}</p>
            )}
            <div className="flex flex-wrap gap-4">
              <button type="button" className={link} onClick={onPick}>{picking ? t('common.close') : t('bank.pick')}</button>
              <button type="button" className={quiet} disabled={working} onClick={() => onIgnore(true)}>{t('bank.ignore')}</button>
            </div>
            {picking && <Picker row={row} working={working} onConfirm={onConfirm} />}
          </div>
        )}

        {row.status === 'OPEN' && row.kind === 'FEE' && (
          <div className="flex flex-wrap gap-4">
            <button type="button" className={link} disabled={working} onClick={onBookFee}>{t('bank.bookFee')}</button>
            <button type="button" className={quiet} disabled={working} onClick={() => onIgnore(true)}>{t('bank.ignore')}</button>
          </div>
        )}

        {row.status === 'OPEN' && (row.kind === 'INCOME' || row.kind === 'CASH') && (
          <button type="button" className={quiet} disabled={working} onClick={() => onIgnore(true)}>{t('bank.setAside')}</button>
        )}
      </div>
    </div>
  );
}

/** Pick the invoices by hand: searchable, several allowed, with the running sum. */
function Picker({ row, working, onConfirm }: { row: BankRow; working: boolean; onConfirm: (ids: string[]) => void }) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [list, setList] = useState<CostLabel[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let stale = false;
    const handle = setTimeout(() => {
      getMatchCandidates({ transactionId: row.id, search }).then((r) => {
        if (stale) return;
        if (r.success) setList(r.data);
        else toast.error(translateError(language, r.error));
      });
    }, 250);
    return () => { stale = true; clearTimeout(handle); };
  }, [row.id, search, language]);

  const sum = useMemo(
    () => Math.round((list ?? []).filter((c) => chosen.has(c.id)).reduce((s, c) => s + c.amount, 0) * 100) / 100,
    [list, chosen],
  );
  const target = Math.abs(row.amount);
  const exact = Math.abs(sum - target) < 0.005;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          className="input-field !py-2 !pl-9"
          placeholder={t('bank.searchPlaceholder')}
          aria-label={t('bank.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={t('common.clear')} onClick={() => setSearch('')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
        {list === null && <li className="px-2 py-2 text-muted-foreground">{t('common.loading')}</li>}
        {list?.length === 0 && <li className="px-2 py-2 text-muted-foreground">{t('bank.noCandidates')}</li>}
        {list?.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={chosen.has(c.id)}
                onChange={(e) => setChosen((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(c.id); else next.delete(c.id);
                  return next;
                })}
              />
              <CostLine c={c} />
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className={`tabular-nums ${exact ? 'text-success' : 'text-muted-foreground'}`}>
          {t('bank.pickedSum').replace('{sum}', formatMoneyExact(sum)).replace('{target}', formatMoneyExact(target))}
        </span>
        <button
          type="button"
          className="cta-button !py-1.5 !px-3 !text-xs"
          disabled={working || chosen.size === 0}
          onClick={() => onConfirm([...chosen])}
        >
          {t('bank.confirmPicked')}
        </button>
      </div>
    </div>
  );
}
