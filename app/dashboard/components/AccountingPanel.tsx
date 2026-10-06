'use client';

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, FileText, Building2, Link2, Check, AlertTriangle } from 'lucide-react';
import { getInvoiceLines, type AccountingSummary } from '../accounting-actions';
import { getDuplicateIngredients, mergeIngredients } from '../reconcile-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import SubTabs from './SubTabs';

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

type View = 'invoices' | 'vendors' | 'tidy';

export default function AccountingPanel() {
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
          { value: 'vendors', label: t('accounting.tabVendors') },
          { value: 'tidy', label: t('accounting.tabTidy') },
        ]}
      />

      {view === 'invoices' && <Invoices />}
      {view === 'vendors' && <Vendors />}
      {view === 'tidy' && <Tidy />}
    </div>
  );
}

/** Every line, searchable. */
function Invoices() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);

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
    }).then((result) => {
      setLoading(false);
      if ('data' in result && result.data) setData(result.data);
    });
  }, [deferredSearch, vendorId, unlinkedOnly]);

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
                        {row.ingredientName}
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
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                    {formatMoney(row.totalPrice)}
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
function Tidy() {
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
