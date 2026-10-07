'use client';

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, FileText, Link2, Check, AlertTriangle, Eye, Trash2 } from 'lucide-react';
import { getInvoiceLines, getInvoices, getDuplicateVendors, mergeVendors, type AccountingSummary, type InvoiceRow2 } from '../accounting-actions';
import { getDuplicateIngredients, mergeIngredients } from '../reconcile-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import SubTabs from './SubTabs';
import ListSearch from './ListSearch';
import InvoicePreview from './InvoicePreview';

/**
 * The paperwork, in one place.
 *
 * Every scanned invoice line: which supplier, what was bought, at what price,
 * on which document. This is what an owner opens when the accountant asks a
 * question, and what they search when they want to know what they paid for
 * beef in March.
 *
 * It also shows the work left undone — lines nobody has said what they are,
 * and ingredients the till left duplicated — because those are the two things
 * that quietly stop the costing from being true.
 */

type View = 'invoices' | 'lines' | 'vendors' | 'tidy';

/**
 * @param initialSearch an invoice number to open on, when the owner
 *   arrived here by tapping a price in the menu. Cleared once used, so
 *   returning to the tab later does not re-apply a stale search.
 */
export default function AccountingPanel({
  initialSearch = '',
  onSearchConsumed,
}: {
  initialSearch?: string;
  onSearchConsumed?: () => void;
} = {}) {
  const { t } = useLanguage();
  const [view, setView] = useState<View>('invoices');

  return (
    <div className="space-y-4">
      <SubTabs
        label={t('accounting.title')}
        active={view}
        onChange={setView}
        tabs={[
          { value: 'invoices', label: t('accounting.tabInvoices') },
          { value: 'lines', label: t('accounting.tabLines') },
          { value: 'vendors', label: t('accounting.tabVendors') },
          { value: 'tidy', label: t('accounting.tabTidy') },
        ]}
      />

      {view === 'invoices' && <InvoiceList />}
      {view === 'lines' && <Invoices initialSearch={initialSearch} onSearchConsumed={onSearchConsumed} />}
      {view === 'vendors' && <Vendors />}
      {view === 'tidy' && <Tidy />}
    </div>
  );
}

/** Every line, searchable. */
function Invoices({ initialSearch = '', onSearchConsumed }: {
  initialSearch?: string;
  onSearchConsumed?: () => void;
}) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);

  // Consumed once: a search applied again on every later visit would be a
  // filter the owner cannot see the origin of.
  useEffect(() => {
    if (initialSearch) onSearchConsumed?.();
     }, [initialSearch, onSearchConsumed]);
  const [vendorId, setVendorId] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [page, setPage] = useState(0);
  /** The document whose photograph is on screen. */
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Typing searches the database; deferring keeps the field responsive rather
  // than firing a query per keystroke.
  const deferredSearch = useDeferredValue(search);
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const load = useCallback(() => {
    setLoading(true);
    getInvoiceLines({
      search: deferredSearch || undefined,
      vendorId: vendorId || undefined,
      unlinkedOnly,
      page,
    }).then((result) => {
      setLoading(false);
      if ('data' in result && result.data) setData(result.data);
    });
  }, [deferredSearch, vendorId, unlinkedOnly, page]);

  // A new filter starts at the top: keeping page 3 while the list
  // changes underneath shows a slice of something else.
  useEffect(() => { setPage(0); }, [deferredSearch, vendorId, unlinkedOnly]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <Spinner label={t('common.loading')} />;
  }

  if (!data || (data.total === 0 && !deferredSearch && !vendorId)) {
    return (
      <Empty
        title={t('accounting.emptyTitle')}
        body={t('accounting.emptyBody')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('accounting.searchPlaceholder')}
            aria-label={t('accounting.search')}
            className="input-field !pl-9 !py-2 !text-sm w-full"
          />
        </div>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          aria-label={t('accounting.vendor')}
          className="input-field !py-2 !text-sm sm:w-56"
        >
          <option value="">{t('accounting.allVendors')}</option>
          {data.vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      {/* The lines nobody has identified are the ones that stop an ingredient
          cost from being true, so they get their own way in. */}
      <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={unlinkedOnly}
          onChange={(e) => setUnlinkedOnly(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-primary"
        />
        <span className="text-muted-foreground">{t('accounting.onlyUnlinked')}</span>
      </label>

      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('accounting.tabInvoices')}</caption>
            <thead>
              <tr className="border-b border-border-subtle">
                <Th>{t('accounting.colProduct')}</Th>
                <Th className="hidden md:table-cell">{t('accounting.colVendor')}</Th>
                <Th className="hidden sm:table-cell">{t('accounting.colDate')}</Th>
                <Th align="right">{t('accounting.colQuantity')}</Th>
                <Th align="right">{t('accounting.colUnitPrice')}</Th>
                <Th align="right">{t('accounting.colTotal')}</Th>
                <Th align="right" className="w-10"><span className="sr-only">{t('accounting.previewTitle')}</span></Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-2.5 min-w-0">
                    <span className="text-foreground [overflow-wrap:anywhere]">{row.productName}</span>
                    {/* What the kitchen calls it, where someone has said. */}
                    {row.ingredientName ? (
                      <span className="flex items-center gap-1 text-[11px] text-success mt-0.5">
                        <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="[overflow-wrap:anywhere]">{row.ingredientName}</span>
                        {/* One supplier line often feeds several kitchen
                            ingredients -- a case of beef is the burger and
                            the extra portion -- so the count is said rather
                            than left to be worked out from the names. */}
                        {row.linkedCount > 1 && (
                          <span className="shrink-0 px-1.5 py-px rounded-full bg-success/15 text-success tabular-nums">
                            {t('accounting.linkedCount').replace('{n}', String(row.linkedCount))}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {t('accounting.notIdentified')}
                      </span>
                    )}
                    <span className="block md:hidden text-[11px] text-muted-foreground mt-0.5">
                      {row.vendorName ?? '—'}
                      {row.invoiceNumber ? ` · ${row.invoiceNumber}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {row.vendorName ?? '—'}
                    {row.invoiceNumber && (
                      <span className="block opacity-70">{row.invoiceNumber}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                    {row.invoiceDate ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                    {row.quantity.toLocaleString(locale)}{row.unit ? ` ${row.unit}` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
                    {formatMoney(row.unitPrice, { decimals: 2 })}
                    {/* A price with no unit is a number nobody can check.
                        9,90 the kilo and 9,90 the box are different
                        purchases, and the column alone never said which. */}
                    {row.unit && (
                      <span className="text-muted-foreground">/{row.unit}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                    {formatMoney(row.totalPrice)}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {/* The page behind the figure. Only where there is a
                        document number to find it by. */}
                    {row.invoiceNumber && (
                      <button
                        type="button"
                        onClick={() => setPreviewing(row.invoiceNumber)}
                        aria-label={t('accounting.previewInvoice').replace('{number}', row.invoiceNumber)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground
                                   hover:bg-muted transition-colors focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('accounting.noMatches')}
          </p>
        )}
      </div>

      {data.rows.length < data.total && (
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          className="cta-button-secondary !py-2 !px-4 !text-sm w-full justify-center"
        >
          {t('accounting.showMore')}
        </button>
      )}

      {previewing && (
        <InvoicePreview
          invoiceNumber={previewing}
          onClose={() => setPreviewing(null)}
          onDeleted={load}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {t('accounting.showing')
          .replace('{shown}', String(data.rows.length))
          .replace('{total}', String(data.total))}
      </p>
    </div>
  );
}

/** What each supplier has been paid, and for how many lines. */
function Vendors() {
  const { t } = useLanguage();
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInvoiceLines().then((result) => {
      setLoading(false);
      if ('data' in result && result.data) setData(result.data);
    });
  }, []);

  if (loading) return <Spinner label={t('common.loading')} />;
  if (!data || data.vendors.length === 0) {
    return <Empty title={t('accounting.noVendorsTitle')} body={t('accounting.emptyBody')} />;
  }

  const biggest = Math.max(...data.vendors.map((v) => v.spend), 1);

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-1">{t('accounting.tabVendors')}</h3>
      <p className="text-xs text-muted-foreground mb-5">{t('accounting.vendorsHint')}</p>

      <ul className="space-y-3">
        {data.vendors.map((vendor) => (
          <li key={vendor.id}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-sm text-foreground truncate">{vendor.name}</span>
              <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                {formatMoney(vendor.spend)}
              </span>
            </div>
            {/* The bar is relative to the biggest supplier, so the shape of
                where the money goes is one glance. */}
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 rounded-full bg-primary/70"
                style={{ width: `${Math.max((vendor.spend / biggest) * 100, 2)}%` }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {t('accounting.lineCount').replace('{n}', String(vendor.lines))}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ingredients the till left duplicated, offered for merging. */
/**
 * Putting right what the readings got wrong.
 *
 * Two kinds of duplicate, from two causes. Suppliers double up because a
 * name is however the reader read the letterhead; ingredients double up
 * because the POS brings its modifiers across as ingredients of their own.
 * Both are proposed and neither is applied without being asked.
 */
function Tidy() {
  return (
    <div className="space-y-4">
      <DuplicateVendors />
      <DuplicateIngredients />
    </div>
  );
}

function DuplicateIngredients() {
  const { t } = useLanguage();
  const [pairs, setPairs] = useState<Array<{
    duplicate: { id: string; name: string };
    original: { id: string; name: string };
  }> | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getDuplicateIngredients().then((result) => {
      if ('data' in result && result.data) {
        setPairs(result.data);
        // Pre-ticked: these are proposed because they are very likely right,
        // and an owner who agrees should not have to tick each one.
        setChosen(new Set(result.data.map((p) => p.duplicate.id)));
      } else {
        setPairs([]);
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (pairs === null) return <Spinner label={t('common.loading')} />;

  if (pairs.length === 0) {
    return <Empty title={t('accounting.tidyNoneTitle')} body={t('accounting.tidyNoneBody')} />;
  }

  const merge = async () => {
    setBusy(true);
    const result = await mergeIngredients(
      pairs
        .filter((p) => chosen.has(p.duplicate.id))
        .map((p) => ({ duplicateId: p.duplicate.id, originalId: p.original.id })),
    );
    setBusy(false);
    if ('error' in result) {
      toast.error(t('errors.write'));
      return;
    }
    toast.success(t('accounting.merged').replace('{n}', String(result.data.merged)));
    load();
  };

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-1">{t('accounting.tidyTitle')}</h3>
      <p className="text-xs text-muted-foreground mb-5 max-w-prose">{t('accounting.tidyBody')}</p>

      <ul className="space-y-2 mb-5">
        {pairs.map((pair) => (
          <li key={pair.duplicate.id}>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface cursor-pointer">
              <input
                type="checkbox"
                checked={chosen.has(pair.duplicate.id)}
                onChange={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (next.has(pair.duplicate.id)) next.delete(pair.duplicate.id);
                    else next.add(pair.duplicate.id);
                    return next;
                  })
                }
                className="w-4 h-4 rounded border-border accent-primary shrink-0"
              />
              <span className="text-sm text-foreground min-w-0">
                <span className="[overflow-wrap:anywhere]">{pair.duplicate.name}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-semibold [overflow-wrap:anywhere]">{pair.original.name}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/* Said plainly: merging is not destructive, but it does change what a
          dish costs, and the owner should know that before pressing it. */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-4">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>{t('accounting.tidyWarning')}</span>
      </p>

      <button
        type="button"
        onClick={merge}
        disabled={busy || chosen.size === 0}
        className="cta-button !py-2 !px-4 !text-sm"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {t('accounting.mergeSelected').replace('{n}', String(chosen.size))}
      </button>
    </div>
  );
}

function Th({ children, align = 'left', className = '' }: {
  children: React.ReactNode; align?: 'left' | 'right'; className?: string;
}) {
  return (
    <th
      scope="col"
      className={`${align === 'right' ? 'text-right' : 'text-left'} font-semibold text-[10px]
                  uppercase tracking-wider text-muted-foreground px-4 py-2.5 ${className}`}
    >
      {children}
    </th>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={label} />
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-glass p-10 text-center">
      <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto">{body}</p>
    </div>
  );
}

/**
 * One butcher written four ways.
 *
 * Grouped by tax number, which is the only reliable identity a supplier has.
 * Two with no NIF on file are never proposed: different companies can have
 * similar names, and merging those would be worse than leaving them apart.
 */
function DuplicateVendors() {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<Array<{
    taxId: string;
    keep: { id: string; name: string };
    merge: Array<{ id: string; name: string; lines: number; costs: number }>;
  }> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getDuplicateVendors().then((result) => {
      setGroups('data' in result && result.data ? result.data : []);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (groups === null || groups.length === 0) return null;

  const merge = async (group: typeof groups[number]) => {
    setBusy(true);
    const result = await mergeVendors({
      keepId: group.keep.id,
      mergeIds: group.merge.map((v) => v.id),
    });
    setBusy(false);
    if ('error' in result) {
      toast.error(t('errors.write'));
      return;
    }
    toast.success(
      t('accounting.vendorsMerged')
        .replace('{n}', String(result.data.merged))
        .replace('{lines}', String(result.data.lines)),
    );
    load();
  };

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-1">{t('accounting.dupVendorsTitle')}</h3>
      <p className="text-xs text-muted-foreground mb-5 max-w-prose">
        {t('accounting.dupVendorsBody')}
      </p>

      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.taxId} className="rounded-xl border border-border-subtle bg-surface p-4">
            <p className="text-sm text-foreground mb-1">
              <span className="font-semibold [overflow-wrap:anywhere]">{group.keep.name}</span>
              <span className="text-muted-foreground text-xs"> · NIF {group.taxId}</span>
            </p>
            {/* Named, not counted: the owner should see which spellings are
                about to disappear into which. */}
            <p className="text-xs text-muted-foreground mb-3">
              {t('accounting.dupVendorsAbsorb')}{' '}
              {group.merge.map((v) => v.name).join(' · ')}
            </p>
            <button
              type="button"
              onClick={() => merge(group)}
              disabled={busy}
              className="cta-button !py-1.5 !px-3 !text-xs"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              {t('accounting.mergeVendors')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The invoices, as documents.
 *
 * What the tab's name promises. The line view beside it answers "what did I
 * pay for beef in March"; this answers "which invoices do I have", which is
 * the question an owner arrives with — there were two documents, not six
 * product rows.
 */
function InvoiceList() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<{ invoices: InvoiceRow2[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [previewing, setPreviewing] = useState<{ number: string; deleting: boolean } | null>(null);

  const deferredSearch = useDeferredValue(search);
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const load = useCallback(() => {
    setLoading(true);
    getInvoices({ search: deferredSearch || undefined, page }).then((result) => {
      setLoading(false);
      if ('data' in result && result.data) setData(result.data);
    });
  }, [deferredSearch, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [deferredSearch]);

  if (loading && !data) return <Spinner label={t('common.loading')} />;

  if (!data || (data.total === 0 && !deferredSearch)) {
    return <Empty title={t('accounting.emptyTitle')} body={t('accounting.emptyBody')} />;
  }

  return (
    <div className="space-y-3">
      <ListSearch
        value={search}
        onChange={setSearch}
        placeholder={t('accounting.searchInvoices')}
        count={data.total}
        matches={data.invoices.length}
        showFrom={6}
      />

      {data.invoices.length === 0 ? (
        <div className="card-glass p-8 text-center text-sm text-muted-foreground">
          {t('accounting.noMatches')}
        </div>
      ) : (
        <ul className="space-y-2">
          {data.invoices.map((invoice) => (
            <li
              key={`${invoice.invoiceNumber ?? ''}-${invoice.date ?? ''}-${invoice.vendorId ?? ''}`}
              className="card-glass p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                    {invoice.invoiceNumber ?? t('accounting.noNumber')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
                    {invoice.vendorName ?? '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {invoice.date
                      ? new Date(invoice.date).toLocaleDateString(locale)
                      : '—'}
                    {' · '}
                    {t('accounting.lineCount').replace('{n}', String(invoice.lineCount))}
                    {/* Only where there is work left: a count of zero is not
                        news, and every invoice would carry one. */}
                    {invoice.unidentified > 0 && (
                      <span className="text-warning">
                        {' · '}
                        {t('accounting.toIdentify').replace('{n}', String(invoice.unidentified))}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {formatMoney(invoice.total)}
                  </span>
                  {invoice.invoiceNumber && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewing({ number: invoice.invoiceNumber!, deleting: false })}
                        aria-label={t('accounting.previewInvoice').replace('{number}', invoice.invoiceNumber)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground
                                   hover:bg-muted transition-colors focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                      {/* Opens the same dialog on its warning rather than
                          deleting here: what goes with an invoice — the cost
                          in the history, the ingredient prices it set — is
                          not guessable from a bin icon. */}
                      <button
                        type="button"
                        onClick={() => setPreviewing({ number: invoice.invoiceNumber!, deleting: true })}
                        aria-label={t('accounting.deleteInvoice')}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-danger
                                   hover:bg-danger/10 transition-colors focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.invoices.length < data.total && (
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          className="cta-button-secondary !py-2 !px-4 !text-sm w-full justify-center"
        >
          {t('accounting.showMore')}
        </button>
      )}

      {previewing && (
        <InvoicePreview
          invoiceNumber={previewing.number}
          startConfirmingDelete={previewing.deleting}
          onClose={() => setPreviewing(null)}
          onDeleted={load}
        />
      )}
    </div>
  );
}
