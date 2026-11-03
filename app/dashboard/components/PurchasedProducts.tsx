'use client';

import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import { Loader2, Search, ChevronRight } from 'lucide-react';
import { getPurchasedProducts } from '../purchase-actions';
import type { PurchasedProduct } from '@/lib/purchased-products';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import PurchasedProductDialog from './PurchasedProductDialog';

/**
 * Everything the restaurant buys, one row per product, biggest spend first.
 *
 * The lines list answers "what was on that invoice"; this answers "what do I
 * keep buying, and what has it cost me". A row opens the product: spend,
 * price range, price over time and every purchase, from every supplier.
 */

const PAGE = 25;

export default function PurchasedProducts() {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [products, setProducts] = useState<PurchasedProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const deferred = useDeferredValue(query);

  useEffect(() => {
    getPurchasedProducts().then((r) => setProducts('data' in r && r.data ? r.data : []));
  }, []);

  useEffect(() => { setLimit(PAGE); }, [deferred]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const needle = deferred.trim().toLowerCase();
    if (!needle) return products;
    // The supplier is searchable too: "what do I buy from the butcher".
    return products.filter((p) =>
      p.name.toLowerCase().includes(needle) ||
      p.suppliers.some((s) => s.toLowerCase().includes(needle)),
    );
  }, [products, deferred]);

  if (products === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card-glass p-10 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">{t('purchases.emptyTitle')}</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">{t('purchases.emptyBody')}</p>
      </div>
    );
  }

  const shown = filtered.slice(0, limit);
  const suppliersLabel = (p: PurchasedProduct) =>
    p.suppliers.length === 0
      ? t('purchases.unknownSupplier')
      : p.suppliers.length === 1
        ? p.suppliers[0]
        : t('purchases.nSuppliers').replace('{n}', String(p.suppliers.length));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('purchases.searchPlaceholder')}
          aria-label={t('purchases.search')}
          className="input-field !pl-9 !py-2 !text-sm w-full"
        />
      </div>

      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('purchases.listTitle')}</caption>
            <thead>
              <tr className="border-b border-border-subtle">
                <th scope="col" className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5">
                  {t('purchases.colProduct')}
                </th>
                <th scope="col" className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5 hidden md:table-cell">
                  {t('purchases.colSuppliers')}
                </th>
                <th scope="col" className="text-right font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                  {t('purchases.colPurchases')}
                </th>
                <th scope="col" className="text-right font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                  {t('purchases.colLastPrice')}
                </th>
                <th scope="col" className="text-right font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5">
                  {t('purchases.colSpent')}
                </th>
                <th scope="col" className="w-8"><span className="sr-only">{t('purchases.open')}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.normalizedName}
                  onClick={() => setOpen(p.normalizedName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(p.normalizedName); }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={t('purchases.openProduct').replace('{name}', p.name)}
                  className="border-b border-border-subtle last:border-0 cursor-pointer transition-colors hover:bg-muted/60
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <td className="px-4 py-2.5 min-w-0">
                    <span className="font-medium text-foreground [overflow-wrap:anywhere]">{p.name}</span>
                    <span className="block md:hidden text-[11px] text-muted-foreground mt-0.5">
                      {suppliersLabel(p)}
                      <span className="sm:hidden">
                        {' · '}
                        {t(p.purchases === 1 ? 'purchases.onePurchase' : 'purchases.nPurchases').replace('{n}', String(p.purchases))}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    <span title={p.suppliers.join(', ')}>{suppliersLabel(p)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                    {p.purchases.toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap hidden sm:table-cell">
                    {p.lastUnitPrice === null ? '—' : formatMoney(p.lastUnitPrice, { decimals: 2 })}
                    {p.lastUnitPrice !== null && p.unit && <span className="text-muted-foreground">/{p.unit}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                    {formatMoney(p.spend, { decimals: 2 })}
                  </td>
                  <td className="pr-3 py-2.5 text-muted-foreground">
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('purchases.noMatches')}</p>
        )}
      </div>

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="cta-button-secondary !py-2 !px-4 !text-sm w-full justify-center"
        >
          {t('purchases.showMore')}
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        {t('purchases.showing')
          .replace('{shown}', String(shown.length))
          .replace('{total}', String(filtered.length))}
      </p>

      {open && <PurchasedProductDialog normalizedName={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
