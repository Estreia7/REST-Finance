'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Receipt, Link2, Check } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getPurchasedProduct } from '../purchase-actions';
import type { ProductDetail } from '@/lib/purchased-products';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { ChartLegend, TooltipCard, TooltipRow, useDismissableTooltip } from './chart-parts';
import InvoicePreview from './InvoicePreview';

/**
 * One product bought, from every supplier it came from.
 *
 * Answers the three questions an owner has about something they keep
 * buying: how much has gone on it, what they have paid for it, and whether
 * that is going up. The purchases follow, each one openable, because a price
 * is only worth believing when the invoice behind it can be put on screen.
 *
 * Opened from wherever a product is named — the products list, an invoice
 * line, a price alert — so it lives in one component.
 */

type Detail = ProductDetail & { ingredients: string[] };

export default function PurchasedProductDialog({
  normalizedName,
  onClose,
}: {
  normalizedName: string;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [detail, setDetail] = useState<Detail | null | 'loading'>('loading');
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail('loading');
    getPurchasedProduct(normalizedName).then((r) => {
      if (cancelled) return;
      setDetail('data' in r && r.data ? r.data : null);
    });
    return () => { cancelled = true; };
  }, [normalizedName]);

  // While an invoice is open over this, Escape is that layer's to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !previewing) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, previewing]);

  const date = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale) : '—');
  const perUnit = (unit: string | null) => (unit ? `/${unit}` : '');

  const ready = detail !== 'loading' && detail !== null ? detail : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchased-product-title"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-card border border-border
                     rounded-t-2xl sm:rounded-2xl shadow-modal"
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
            <div className="min-w-0">
              <h3 id="purchased-product-title" className="text-sm font-bold text-foreground [overflow-wrap:anywhere]">
                {ready?.name ?? t('purchases.title')}
              </h3>
              {ready && (
                ready.ingredients.length > 0 ? (
                  <p className="flex items-center gap-1 text-[11px] text-success mt-0.5">
                    <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="[overflow-wrap:anywhere]">
                      {t('purchases.ingredient').replace('{name}', ready.ingredients.join(', '))}
                    </span>
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                    <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {t('purchases.noIngredient')}
                  </p>
                )
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted
                         transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-5">
            {detail === 'loading' ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
              </div>
            ) : detail === null ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('purchases.notFound')}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label={t('purchases.spent')}
                    value={formatMoney(detail.spend, { decimals: 2 })}
                    sub={t(detail.purchases === 1 ? 'purchases.onePurchase' : 'purchases.nPurchases')
                      .replace('{n}', String(detail.purchases))}
                  />
                  <Stat
                    label={t('purchases.pricePaid')}
                    value={
                      detail.minPrice === null || detail.maxPrice === null
                        ? '—'
                        : detail.minPrice === detail.maxPrice
                          ? formatMoney(detail.minPrice, { decimals: 2 })
                          : `${formatMoney(detail.minPrice, { decimals: 2 })} – ${formatMoney(detail.maxPrice, { decimals: 2 })}`
                    }
                    sub={detail.unit ? t('purchases.perUnit').replace('{unit}', detail.unit) : undefined}
                  />
                </div>

                <section>
                  <h4 className="text-xs font-semibold text-foreground mb-2">{t('purchases.evolution')}</h4>
                  <PriceChart
                    points={detail.points}
                    unit={detail.unit}
                    locale={locale}
                    suppliers={detail.suppliers.map((s) => s.vendorName)}
                  />
                  {detail.otherUnitPurchases > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {t('purchases.otherUnits')
                        .replace('{n}', String(detail.otherUnitPurchases))
                        .replace('{unit}', detail.unit ?? '—')}
                    </p>
                  )}
                </section>

                {/* Who it came from, when more than one supplier sold it: the
                    comparison behind "buy it from the other one". */}
                {detail.suppliers.length > 1 && (
                  <section>
                    <h4 className="text-xs font-semibold text-foreground mb-2">
                      {t('purchases.bySupplier').replace('{n}', String(detail.suppliers.length))}
                    </h4>
                    <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                      {detail.suppliers.map((s) => (
                        <li key={s.vendorId ?? s.vendorName ?? '—'} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-foreground truncate">{s.vendorName ?? t('purchases.unknownSupplier')}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {t(s.purchases === 1 ? 'purchases.onePurchase' : 'purchases.nPurchases').replace('{n}', String(s.purchases))}
                              {s.lastUnitPrice !== null && ` · ${t('purchases.lastPrice')} ${formatMoney(s.lastUnitPrice, { decimals: 2 })}${perUnit(detail.unit)}`}
                            </span>
                          </span>
                          <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">
                            {formatMoney(s.spend, { decimals: 2 })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h4 className="text-xs font-semibold text-foreground mb-2">
                    {t('purchases.history').replace('{n}', String(detail.history.length))}
                  </h4>
                  <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                    {detail.history.map((h) => {
                      const openable = Boolean(h.invoiceNumber);
                      const Row = openable ? 'button' : 'div';
                      return (
                        <li key={h.id}>
                          <Row
                            {...(openable
                              ? {
                                  type: 'button' as const,
                                  onClick: () => setPreviewing(h.invoiceNumber!),
                                  'aria-label': t('accounting.previewInvoice').replace('{number}', h.invoiceNumber!),
                                }
                              : {})}
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left ${
                              openable
                                ? 'hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                                : ''
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-foreground truncate">
                                {h.vendorName ?? t('purchases.unknownSupplier')}
                              </span>
                              <span className="block text-[11px] text-muted-foreground truncate tabular-nums">
                                {date(h.date)}
                                {h.invoiceNumber && (
                                  <>
                                    {' · '}
                                    <Receipt className="w-3 h-3 inline -mt-0.5" aria-hidden="true" />
                                    {' '}{h.invoiceNumber}
                                  </>
                                )}
                              </span>
                            </span>
                            <span className="text-right shrink-0">
                              <span className="block text-xs font-semibold text-foreground tabular-nums">
                                {formatMoney(h.total, { decimals: 2 })}
                              </span>
                              <span className="block text-[11px] text-muted-foreground tabular-nums">
                                {h.quantity.toLocaleString(locale)}{h.unit ? ` ${h.unit}` : ''} × {formatMoney(h.unitPrice, { decimals: 2 })}
                              </span>
                            </span>
                          </Row>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {previewing && (
        <InvoicePreview invoiceNumber={previewing} onClose={() => setPreviewing(null)} />
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground tabular-nums [overflow-wrap:anywhere]">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * The price paid at each purchase, oldest on the left.
 *
 * Straight segments, not a smoothed curve: between two purchases nothing was
 * paid, and a curve would draw prices that never happened. With more than
 * one supplier each point takes its supplier's colour, named in the legend,
 * so the dearer supplier is visible without reading every tooltip.
 */
function PriceChart({
  points, unit, locale, suppliers,
}: {
  points: ProductDetail['points'];
  unit: string | null;
  locale: string;
  /** Biggest spend first: the order the colours are handed out in. */
  suppliers: Array<string | null>;
}) {
  const chart = useChartTheme();
  const { t } = useLanguage();
  const { plotRef, chartProps, tooltipProps } = useDismissableTooltip();

  if (points.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{t('purchases.noPrices')}</p>;
  }

  const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const series = points.map((p, i) => ({ ...p, i }));
  const several = suppliers.length > 1;
  const palette = chart.data.categories;
  const colorOf = (name: string | null) => {
    if (!several) return chart.data.costs;
    const at = suppliers.indexOf(name);
    return at >= 0 && at < palette.length ? palette[at] : chart.data.other;
  };

  return (
    <div ref={plotRef}>
      {several && (
        <ChartLegend
          items={suppliers.map((name) => ({
            key: name ?? '—',
            color: colorOf(name),
            label: name ?? t('purchases.unknownSupplier'),
          }))}
        />
      )}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart {...chartProps} data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis
            dataKey="i"
            type="category"
            tickFormatter={(i: number) => short(series[i]?.date ?? '')}
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
            tickMargin={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatMoney(v, { decimals: 2 })}
          />
          <Tooltip
            {...tooltipProps}
            cursor={{ stroke: chart.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof series)[number];
              return (
                <TooltipCard title={new Date(`${p.date}T12:00:00`).toLocaleDateString(locale)}>
                  <TooltipRow
                    color={colorOf(p.vendorName)}
                    label={p.vendorName ?? t('purchases.unknownSupplier')}
                    value={`${formatMoney(p.unitPrice, { decimals: 2 })}${unit ? `/${unit}` : ''}`}
                  />
                </TooltipCard>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="unitPrice"
            stroke={several ? chart.axis : chart.data.costs}
            strokeOpacity={several ? 0.45 : 1}
            strokeWidth={several ? 1.5 : 2}
            dot={(d: { cx?: number; cy?: number; index?: number; payload?: { vendorName: string | null } }) => (
              <circle key={d.index} cx={d.cx} cy={d.cy} r={several ? 4 : 3} fill={colorOf(d.payload?.vendorName ?? null)} stroke={chart.surface} strokeWidth={several ? 1.5 : 0} />
            )}
            activeDot={(d: { cx?: number; cy?: number; payload?: { vendorName: string | null } }) => (
              <circle cx={d.cx} cy={d.cy} r={6} fill={colorOf(d.payload?.vendorName ?? null)} stroke={chart.surface} strokeWidth={2} />
            )}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {points.length === 1 && (
        <p className="text-[11px] text-muted-foreground">{t('purchases.onePrice')}</p>
      )}
    </div>
  );
}
