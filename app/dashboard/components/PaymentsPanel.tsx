'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Eye, Paperclip, CalendarClock, Undo2, Repeat, Pencil, Wallet,
} from 'lucide-react';
import {
  getPayables, markPaid, markUnpaid, setDueDate, setVendorTerms,
  type PayableGroup, type PayableRow, type PayablesFilter,
} from '../payment-actions';
import { PAYMENT_METHODS, type PayablesSummary, type PaymentMethodKey } from '@/lib/payments';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { PayablesRunway } from './PayablesCard';
import { METHOD_ICON } from './PaymentFields';
import AttachInvoiceDialog from './AttachInvoiceDialog';
import InvoicePreview from './InvoicePreview';
import Dialog from './Dialog';

/**
 * What each supplier is owed, and when.
 *
 * Grouped by supplier because that is how an owner pays: one transfer to
 * Makro for everything due this week, not one per invoice. The filter on top
 * is the fast way to "only what is still to pay"; the list remembers nothing
 * of it, so opening the tab again starts on what is owed.
 */

const FILTERS: PayablesFilter[] = ['open', 'overdue', 'paid', 'all'];
const FILTER_LABEL: Record<PayablesFilter, string> = {
  open: 'payments.filterOpen',
  overdue: 'payments.filterOverdue',
  paid: 'payments.filterPaid',
  all: 'payments.filterAll',
};
/** Rows shown per supplier before "show more". */
const PAGE = 8;

interface Data {
  today: string;
  summary: PayablesSummary;
  groups: PayableGroup[];
  vendors: Array<{ id: string; name: string; termsDays: number | null }>;
}

export default function PaymentsPanel({ initialFilter = 'open' }: { initialFilter?: PayablesFilter }) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [filter, setFilter] = useState<PayablesFilter>(initialFilter);
  const [vendorId, setVendorId] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [paying, setPaying] = useState<string[] | null>(null);
  const [dating, setDating] = useState<PayableRow | null>(null);
  const [terms, setTerms] = useState<PayableGroup | null>(null);
  const [attaching, setAttaching] = useState<{ row: PayableRow; hasVendor: boolean } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);

  const load = useCallback(() => {
    setLoading(true);
    getPayables({ filter, vendorId: vendorId || null }).then((r) => {
      setLoading(false);
      if ('data' in r && r.data) setData(r.data);
    });
  }, [filter, vendorId]);

  useEffect(() => { load(); }, [load]);
  // A selection belongs to the list it was made on.
  useEffect(() => { setSelected(new Set()); }, [filter, vendorId]);

  const rows = useMemo(() => data?.groups.flatMap((g) => g.rows) ?? [], [data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const openIds = rows.filter((r) => r.state !== 'paid').map((r) => r.id);
  const selectedTotal = [...selected].reduce((s, id) => s + (byId.get(id)?.amount ?? 0), 0);

  // Two digits always, and the year only when it is not this one: a cost
  // from last March must not read as this March.
  const shortDate = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString(locale, {
      day: '2-digit', month: '2-digit', timeZone: 'UTC',
      ...(data && key.slice(0, 4) !== data.today.slice(0, 4) ? { year: 'numeric' as const } : {}),
    });

  const toggle = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) (on ? next.add(id) : next.delete(id));
      return next;
    });

  const reopen = async (row: PayableRow) => {
    const r = await markUnpaid({ ids: [row.id] });
    if ('error' in r) { toast.error(t(r.error ?? 'errors.write')); return; }
    toast.success(t('payments.reopened'));
    load();
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
      </div>
    );
  }
  if (!data) return null;

  const empty = data.groups.length === 0;
  const emptyCopy = filter === 'overdue'
    ? ['payments.emptyOverdueTitle', 'payments.emptyOverdueBody']
    : filter === 'open'
      ? ['payments.emptyOpenTitle', 'payments.emptyOpenBody']
      : ['payments.emptyTitle', 'payments.emptyBody'];

  return (
    <div className="space-y-4 pb-20">
      {data.summary.open.count > 0 && (
        <div className="card-glass p-5">
          <p className="text-xs text-muted-foreground mb-3 tabular-nums">
            {t('payments.openTotal').replace('{amount}', formatMoney(data.summary.open.total))}
          </p>
          <PayablesRunway summary={data.summary} />
        </div>
      )}

      {/* The fast filter, and the supplier. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-full sm:w-fit overflow-x-auto" role="group" aria-label={t('payments.filterLabel')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t(FILTER_LABEL[f])}
              {f === 'overdue' && data.summary.overdue.count > 0 && (
                <span className="ml-1.5 px-1.5 py-px rounded-full bg-danger/15 text-danger tabular-nums">
                  {data.summary.overdue.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          aria-label={t('payments.vendor')}
          className="input-field !py-2 !text-sm sm:w-64 sm:ml-auto"
        >
          <option value="">{t('payments.allVendors')}</option>
          {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {(filter === 'open' || filter === 'overdue') && data.summary.overdue.count > 0 && (
        <p className="text-xs text-muted-foreground max-w-prose">{t('payments.reviewHint')}</p>
      )}

      {empty ? (
        <div className="card-glass p-10 text-center">
          <Wallet className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground mb-1">{t(emptyCopy[0])}</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">{t(emptyCopy[1])}</p>
        </div>
      ) : (
        <>
          {openIds.length > 1 && (
            <button
              type="button"
              onClick={() => toggle(openIds, selected.size < openIds.length)}
              className="text-xs font-semibold text-primary-ink hover:underline"
            >
              {selected.size < openIds.length
                ? t('payments.selectAll').replace('{n}', String(openIds.length))
                : t('payments.clearSelection')}
            </button>
          )}

          <ul className="space-y-4">
            {data.groups.map((group) => {
              const key = group.vendorId ?? '';
              const groupOpen = group.rows.filter((r) => r.state !== 'paid').map((r) => r.id);
              const allOn = groupOpen.length > 0 && groupOpen.every((id) => selected.has(id));
              const showAll = expanded.has(key);
              const visible = showAll ? group.rows : group.rows.slice(0, PAGE);
              const name = group.vendorName ?? t('payments.noVendor');
              return (
                <li key={key} className="card-glass overflow-hidden">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-border-subtle">
                    {groupOpen.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allOn}
                        onChange={(e) => toggle(groupOpen, e.target.checked)}
                        aria-label={t('payments.selectGroup').replace('{vendor}', name)}
                        className="w-4 h-4 rounded border-border accent-primary shrink-0"
                      />
                    )}
                    <h3 className="font-semibold text-foreground text-sm min-w-0 [overflow-wrap:anywhere]">{name}</h3>
                    {group.vendorId && (
                      <button
                        type="button"
                        onClick={() => setTerms(group)}
                        aria-label={t('payments.termsEdit').replace('{vendor}', name)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium
                                   text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {group.termsDays === null
                          ? t('payments.termsDefault')
                          : t('payments.terms').replace('{days}', String(group.termsDays))}
                        <Pencil className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                    <span className="ml-auto flex items-baseline gap-2 text-xs tabular-nums">
                      {group.overdue.count > 0 && (
                        <span className="font-semibold text-danger">
                          {t('payments.overdueCount').replace('{n}', String(group.overdue.count))}
                        </span>
                      )}
                      {group.open.count > 0 && (
                        <span className="font-bold text-foreground">
                          {t('payments.owed').replace('{amount}', formatMoney(group.open.total, { decimals: 2 }))}
                        </span>
                      )}
                    </span>
                  </div>

                  <ul>
                    {visible.map((row) => (
                      <PayableItem
                        key={row.id}
                        row={row}
                        selected={selected.has(row.id)}
                        onSelect={(on) => toggle([row.id], on)}
                        shortDate={shortDate}
                        onPay={() => setPaying([row.id])}
                        onReopen={() => reopen(row)}
                        onDue={() => setDating(row)}
                        onAttach={() => setAttaching({ row, hasVendor: !!group.vendorId })}
                        onPreview={() => row.previewNumber && setPreviewing(row.previewNumber)}
                      />
                    ))}
                  </ul>

                  {group.rows.length > PAGE && !showAll && (
                    <button
                      type="button"
                      onClick={() => setExpanded((c) => new Set(c).add(key))}
                      className="w-full px-4 py-2.5 text-xs font-semibold text-primary-ink hover:bg-muted border-t border-border-subtle"
                    >
                      {t('payments.showMore').replace('{n}', String(group.rows.length - PAGE))}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* What is selected, and the one thing to do with it. */}
      {selected.size > 0 && (
        <div
          className="fixed z-40 left-4 right-4 md:left-[calc(15rem+1.5rem)] md:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6
                     flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-modal"
          role="region"
          aria-label={t('payments.markSelectedPaid')}
        >
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {t('payments.selected')
              .replace('{n}', String(selected.size))
              .replace('{amount}', formatMoney(selectedTotal, { decimals: 2 }))}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="cta-button-secondary !py-2 !px-3 !text-xs">
              {t('payments.clearSelection')}
            </button>
            <button type="button" onClick={() => setPaying([...selected])} className="cta-button !py-2 !px-4 !text-xs">
              {t('payments.markSelectedPaid')}
            </button>
          </span>
        </div>
      )}

      {paying && (
        <MarkPaidDialog
          ids={paying}
          total={paying.reduce((s, id) => s + (byId.get(id)?.amount ?? 0), 0)}
          today={data.today}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); setSelected(new Set()); load(); }}
        />
      )}
      {dating && (
        <DueDialog row={dating} onClose={() => setDating(null)} onDone={() => { setDating(null); load(); }} />
      )}
      {terms && (
        <TermsDialog group={terms} onClose={() => setTerms(null)} onDone={() => { setTerms(null); load(); }} />
      )}
      {attaching && (
        <AttachInvoiceDialog
          target={{
            costEntryId: attaching.row.id,
            amount: attaching.row.amount,
            description: attaching.row.description,
          }}
          hasVendor={attaching.hasVendor}
          onClose={() => setAttaching(null)}
          onAttached={() => { setAttaching(null); load(); }}
        />
      )}
      {previewing && (
        <InvoicePreview invoiceNumber={previewing} onClose={() => setPreviewing(null)} onDeleted={load} />
      )}
    </div>
  );
}

function PayableItem({
  row, selected, onSelect, shortDate, onPay, onReopen, onDue, onAttach, onPreview,
}: {
  row: PayableRow;
  selected: boolean;
  onSelect: (on: boolean) => void;
  shortDate: (key: string) => string;
  onPay: () => void;
  onReopen: () => void;
  onDue: () => void;
  onAttach: () => void;
  onPreview: () => void;
}) {
  const { t } = useLanguage();
  const open = row.state !== 'paid';
  const what = row.invoiceNumber ?? row.description ?? shortDate(row.dateKey);

  const status = (() => {
    switch (row.state) {
      case 'overdue': {
        const late = -row.daysUntilDue;
        return {
          tone: 'text-danger font-semibold',
          text: late === 1 ? t('payments.overdueOne') : t('payments.overdueBy').replace('{n}', String(late)),
        };
      }
      case 'due':
        return {
          tone: row.daysUntilDue <= 7 ? 'text-foreground font-medium' : 'text-muted-foreground',
          text: row.daysUntilDue === 0
            ? t('payments.dueToday')
            : row.daysUntilDue === 1
              ? t('payments.dueTomorrow')
              : t('payments.dueIn').replace('{n}', String(row.daysUntilDue)),
        };
      case 'scheduled':
        return { tone: 'text-muted-foreground', text: t('payments.scheduledOn').replace('{date}', shortDate(row.dueKey)) };
      default:
        return {
          tone: 'text-success',
          text: t('payments.paidOn').replace('{date}', row.paidKey ? shortDate(row.paidKey) : '—')
            + (row.method ? ` · ${t(`payments.method_${row.method}`)}` : ''),
        };
    }
  })();

  const iconButton = 'p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <li className={`flex items-start gap-3 px-4 py-3 border-b border-border-subtle last:border-0 ${selected ? 'bg-primary-subtle/60' : ''}`}>
      <span className="w-4 shrink-0 pt-0.5">
        {open && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={t('payments.selectRow').replace('{what}', what)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
        )}
      </span>

      <div className="flex-1 min-w-0">
        {/* The document and its amount on one line; what it is under it;
            then where it stands, with what can be done about it. */}
        <div className="flex items-start justify-between gap-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm min-w-0">
            <span className="font-medium text-foreground tabular-nums">{shortDate(row.dateKey)}</span>
            {row.invoiceNumber ? (
              <span className="text-muted-foreground [overflow-wrap:anywhere]">{row.invoiceNumber}</span>
            ) : !row.recurring && (
              // Not on a month booked by a fixed cost: rent has no invoice
              // to chase every month. It can still be added from the history.
              <button
                type="button"
                onClick={onAttach}
                className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full border border-dashed border-border
                           text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Paperclip className="w-3 h-3" aria-hidden="true" />
                {t('payments.noInvoice')} · {t('payments.attachInvoice')}
              </button>
            )}
            {row.recurring && <Repeat className="w-3 h-3 text-primary-ink" aria-label={t('recurring.bookedAutomatically')} />}
          </p>
          <span className="text-sm font-bold text-foreground tabular-nums shrink-0">{formatMoney(row.amount, { decimals: 2 })}</span>
        </div>
        {(row.description || row.categoryName) && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {[row.categoryName, row.description].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mt-1.5">
          <p className={`text-xs ${status.tone}`}>
            {status.text}
            {open && row.dueIsOwn && <span className="text-muted-foreground font-normal"> · {t('payments.ownDue')}</span>}
          </p>
          <span className="flex items-center gap-0.5 ml-auto">
            {row.previewNumber && (
              <button type="button" onClick={onPreview} className={iconButton}
                aria-label={t('accounting.previewInvoice').replace('{number}', row.previewNumber)} title={t('accounting.previewInvoice').replace('{number}', row.previewNumber)}>
                <Eye className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {open && (
              <button type="button" onClick={onDue} className={iconButton} aria-label={t('payments.changeDue')} title={t('payments.changeDue')}>
                <CalendarClock className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {/* Also on a direct debit that paid itself: one that bounced is owed again. */}
            {row.state === 'paid' && (
              <button type="button" onClick={onReopen} className={iconButton} aria-label={t('payments.reopen')} title={t('payments.reopen')}>
                <Undo2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {open && (
              <button type="button" onClick={onPay} className="cta-button !py-1 !px-2.5 !text-xs ml-1">
                {t('payments.markPaid')}
              </button>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

function MarkPaidDialog({
  ids, total, today, onClose, onDone,
}: {
  ids: string[];
  total: number;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [method, setMethod] = useState<PaymentMethodKey | null>(null);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!method) { toast.error(t('payments.methodRequired')); return; }
    setBusy(true);
    const r = await markPaid({ ids, method, paidOn: date });
    setBusy(false);
    if ('error' in r) { toast.error(t(r.error ?? 'errors.write')); return; }
    toast.success(t('payments.markedPaid').replace('{n}', String(r.data.count)));
    onDone();
  };

  return (
    <Dialog
      title={ids.length === 1 ? t('payments.markPaidTitle') : t('payments.markPaidTitleMany').replace('{n}', String(ids.length))}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground tabular-nums">
          {t('payments.markPaidTotal').replace('{amount}', formatMoney(total, { decimals: 2 }))}
        </p>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2" id="mark-paid-method">{t('payments.howPaid')}</p>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby="mark-paid-method">
            {PAYMENT_METHODS.map((m) => {
              const Icon = METHOD_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold text-left transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${method === m ? 'border-primary bg-primary-subtle text-foreground' : 'border-border-subtle bg-surface text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t(`payments.method_${m}`)}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground block mb-2">{t('payments.paidDate')}</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="input-field" />
        </label>
        <button type="button" onClick={confirm} disabled={busy || !method || !date} className="cta-button w-full justify-center">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {t('payments.confirm')}
        </button>
      </div>
    </Dialog>
  );
}

function DueDialog({ row, onClose, onDone }: { row: PayableRow; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [date, setDate] = useState(row.dueKey);
  const [busy, setBusy] = useState(false);

  const save = async (dueDate: string | null) => {
    setBusy(true);
    const r = await setDueDate({ id: row.id, dueDate });
    setBusy(false);
    if ('error' in r) { toast.error(t(r.error ?? 'errors.write')); return; }
    toast.success(t('payments.dueSaved'));
    onDone();
  };

  return (
    <Dialog title={t('payments.changeDue')} onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground block mb-2">{t('payments.dueDate')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
        </label>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => save(date)} disabled={busy || !date} className="cta-button w-full justify-center">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t('common.save')}
          </button>
          {row.dueIsOwn && (
            <button type="button" onClick={() => save(null)} disabled={busy} className="cta-button-secondary w-full justify-center">
              {t('payments.dueReset')}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function TermsDialog({ group, onClose, onDone }: { group: PayableGroup; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [days, setDays] = useState(group.termsDays === null ? '' : String(group.termsDays));
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group.vendorId) return;
    setBusy(true);
    const r = await setVendorTerms({ vendorId: group.vendorId, days: days.trim() === '' ? null : Number(days) });
    setBusy(false);
    if ('error' in r) { toast.error(t(r.error ?? 'errors.write')); return; }
    toast.success(t('payments.termsSaved'));
    onDone();
  };

  return (
    <Dialog title={t('payments.termsEdit').replace('{vendor}', group.vendorName ?? '')} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground block mb-2">{t('payments.termsLabel')}</span>
          <input
            type="number" min={0} max={365} step={1} inputMode="numeric"
            value={days}
            placeholder="30"
            onChange={(e) => setDays(e.target.value)}
            className="input-field"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[0, 15, 30, 60, 90].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={days === String(n)}
              onClick={() => setDays(String(n))}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors
                ${days === String(n) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="submit" disabled={busy} className="cta-button w-full justify-center">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {t('common.save')}
        </button>
      </form>
    </Dialog>
  );
}
