'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { Loader2, Search, X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getProductAnalysis, getProductMonthly } from '../product-actions';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import type { ProductTotals } from '@/lib/products';
import {
  ChartHeader,
  TooltipCard,
  TooltipRow,
  barPath,
  monthLabel,
  useDismissableTooltip,
} from './chart-parts';

/**
 * What sold, item by item.
 *
 * Built around one question an owner cannot answer from the family totals:
 * which dishes carry the business. So the table is the surface, not a
 * supporting detail under a chart — and each row draws its own share of the
 * takings behind the text, which is what makes the mix readable by running
 * an eye down the column instead of comparing twenty percentages.
 *
 * Picking a row swaps the chart above to that product alone. The chart is
 * units rather than money on purpose: an owner deciding whether to keep a
 * dish wants to know how often it goes out, and the money is already in the
 * row they clicked.
 */

interface Analysis {
  year: number;
  availableYears: number[];
  products: ProductTotals[];
  familias: string[];
  best: ProductTotals | null;
  worst: ProductTotals | null;
  total: number;
  monthly: Array<{ monthIndex: number; quantity: number; revenue: number }>;
}

interface Selected {
  product: { id: string; code: string; name: string; familia: string | null };
  monthly: Array<{ monthIndex: number; quantity: number; revenue: number }>;
  quantity: number;
  revenue: number;
}

/** How many rows to show before the owner asks for more. */
const PAGE = 25;

/** The share bar's track, in pixels. */
const SHARE_BAR_PX = 48;

/**
 * How long to draw a row's share bar.
 *
 * On a square root rather than straight across. A real menu is concentrated:
 * in a year of this restaurant's data two burgers took 44% between them, so
 * on a linear scale everything from the third row down collapsed into an
 * indistinguishable two-to-six pixel stub — the bar stopped telling the owner
 * anything exactly where they need to compare, which is the middle of the
 * table.
 *
 * The square root keeps the order intact and gives the small shares a
 * readable length. It does mean the bar understates how far ahead the leaders
 * are, which would be the wrong trade if the bar were the only reading — but
 * the percentage sits beside every one of them, and this bar's job is to make
 * the ranking scannable, not to be measured off.
 */
function shareBarWidth(share: number | null, widest: number): number {
  if (!share || share <= 0 || widest <= 0) return 2;
  return Math.max(Math.sqrt(share / widest) * SHARE_BAR_PX, 2);
}

export default function ProductsPanel() {
  const chart = useChartTheme();
  const { t, language } = useLanguage();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [familia, setFamilia] = useState('');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // Typing filters a few thousand rows; deferring keeps the field responsive
  // while the table catches up rather than dropping keystrokes.
  const deferredQuery = useDeferredValue(query);

  // The year as it is now, for the in-flight check below: a closure's own
  // `year` is frozen at the render that created it.
  const yearRef = useRef(year);
  useEffect(() => { yearRef.current = year; }, [year]);

  const load = useCallback(() => {
    setLoading(true);
    getProductAnalysis(year).then((r) => {
      if (!('data' in r) || !r.data) { setLoading(false); return; }
      const result = r.data as Analysis;

      // The current year has no import yet on a first visit, so the answer
      // comes back empty with a list of the years that do have one. Jump to
      // the newest of those and leave `data` alone: writing the empty result
      // first would flash an empty table for a frame before the refetch.
      if (result.availableYears.length && !result.availableYears.includes(year)) {
        setYear(result.availableYears[0]);
        return;
      }

      setData(result);
      setLoading(false);
    });
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // A product picked in one year, and a family that existed in it, mean
  // nothing in another — a stale family filter would show "no matches" on a
  // year with plenty in it.
  useEffect(() => {
    setSelected(null);
    setFamilia('');
    setLimit(PAGE);
  }, [year]);

  useEffect(() => { setLimit(PAGE); }, [deferredQuery, familia]);

  const pick = (product: ProductTotals) => {
    // Clicking the selected row again clears it, so the same row toggles the
    // chart between this product and everything.
    if (selected?.product.id === product.id) { setSelected(null); return; }

    const forYear = year;
    getProductMonthly(product.id, forYear).then((r) => {
      // Dropped if the owner stepped to another year while this was in
      // flight: the answer belongs to the year they left. Read through the
      // ref, because the closure's own `year` is the one from this render and
      // would always match.
      if (forYear !== yearRef.current) return;
      if ('data' in r && r.data) setSelected(r.data as Selected);
    });
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = deferredQuery.trim().toLowerCase();
    return data.products.filter((p) => {
      if (familia && p.familia !== familia) return false;
      if (!needle) return true;
      // The family is searchable too: two rows can share a name, and
      // "menus" is how an owner narrows to the menu versions of a dish.
      return (
        p.name.toLowerCase().includes(needle) ||
        p.code.toLowerCase().includes(needle) ||
        (p.familia ?? '').toLowerCase().includes(needle)
      );
    });
  }, [data, deferredQuery, familia]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
      </div>
    );
  }

  if (!data || data.availableYears.length === 0) {
    return (
      <div className="card-glass p-10 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">{t('products.empty')}</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">{t('products.emptyHint')}</p>
      </div>
    );
  }

  // Units, not money: the chart answers "how often does this go out".
  const series = (selected ? selected.monthly : data.monthly).map((m) => ({
    label: monthLabel('', language, m.monthIndex),
    quantity: m.quantity,
    revenue: m.revenue,
  }));

  return (
    <div className="space-y-4">
      {/* The two ends of the menu, side by side. The comparison is the
          information, so they share one row rather than sitting in a grid of
          four identical metric cards. */}
      {(data.best || data.worst) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Extreme
            kind="best"
            label={t('products.bestSeller')}
            product={data.best}
            unitsLabel={t('products.units')}
            shareLabel={t('products.ofRevenue')}
          />
          <Extreme
            kind="worst"
            label={t('products.worstSeller')}
            product={data.worst}
            unitsLabel={t('products.units')}
            shareLabel={t('products.ofRevenue')}
          />
        </div>
      )}

      {/* Units per month, for everything or for the one product picked. */}
      <div className="card-glass p-6">
        <ChartHeader
          title={
            selected
              ? t('products.selectedTitle').replace(
                  '{product}',
                  // With the family, because the till sells the same dish
                  // under two codes — one à la carte, one inside a menu —
                  // and the name alone does not say which was picked.
                  selected.product.familia
                    ? `${selected.product.name} (${selected.product.familia})`
                    : selected.product.name,
                )
              : t('products.allTitle')
          }
          subtitle={
            selected
              ? t('products.selectedSubtitle').replace('{year}', String(year))
              : t('products.allSubtitle')
          }
          year={year}
          onYearChange={setYear}
          availableYears={data.availableYears}
        />

        {selected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs">
            <span className="text-muted-foreground">
              {selected.quantity.toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}{' '}
              <span className="text-foreground font-semibold">{t('products.units')}</span>
            </span>
            <span className="text-muted-foreground">
              <span className="text-foreground font-semibold tabular-nums">
                {formatMoney(selected.revenue)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-auto inline-flex items-center gap-1 text-primary hover:underline underline-offset-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              {t('products.backToAll')}
            </button>
          </div>
        )}

        <MonthlyUnits series={series} chart={chart} year={year} t={t} />
      </div>

      {/* Search and family filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('products.searchPlaceholder')}
            aria-label={t('products.search')}
            className="input-field !pl-9 !py-2 !text-sm w-full"
          />
        </div>
        <select
          value={familia}
          onChange={(e) => setFamilia(e.target.value)}
          aria-label={t('products.colFamilia')}
          className="input-field !py-2 !text-sm sm:w-48"
        >
          <option value="">{t('products.allFamilias')}</option>
          {data.familias.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* The table. Each row draws its share behind the text, so the mix
          reads by scanning rather than by comparing numbers. */}
      <ProductTable
        products={filtered}
        limit={limit}
        onMore={() => setLimit((n) => n + PAGE)}
        selectedId={selected?.product.id ?? null}
        onPick={pick}
      />
    </div>
  );
}

/**
 * The best or slowest seller.
 *
 * The arrow and the word carry the meaning; the tint only reinforces it, so
 * this still reads for anyone who cannot separate the two hues.
 */
function Extreme({
  kind, label, product, unitsLabel, shareLabel,
}: {
  kind: 'best' | 'worst';
  label: string;
  product: ProductTotals | null;
  unitsLabel: string;
  shareLabel: string;
}) {
  const { language } = useLanguage();
  if (!product) return null;

  const Icon = kind === 'best' ? ArrowUpRight : ArrowDownRight;
  const tone = kind === 'best' ? 'text-success' : 'text-muted-foreground';

  return (
    <div className="card-glass p-4 flex items-start gap-3">
      <span className={`mt-0.5 shrink-0 ${tone}`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-bold text-foreground leading-snug break-words">{product.name}</p>
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          {product.quantity.toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')} {unitsLabel}
          {' · '}
          {formatMoney(product.revenue)}
          {product.share !== null && ` · ${product.share.toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}% ${shareLabel}`}
        </p>
      </div>
    </div>
  );
}

/** Units per month, in the same bar language as the dashboard's charts. */
function MonthlyUnits({
  series, chart, year, t,
}: {
  series: Array<{ label: string; quantity: number; revenue: number }>;
  chart: ReturnType<typeof useChartTheme>;
  year: number;
  t: (key: string) => string;
}) {
  const { plotRef, chartProps, tooltipProps } = useDismissableTooltip();
  const { language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  if (series.every((p) => p.quantity === 0)) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        {t('products.emptyYear')}
      </div>
    );
  }

  return (
    <div ref={plotRef}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart {...chartProps} data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={2}
            tickMargin={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
            tickFormatter={(v: number) => v.toLocaleString(locale)}
          />
          <Tooltip
            {...tooltipProps}
            cursor={{ fill: chart.grid, opacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as { quantity: number; revenue: number };
              return (
                <TooltipCard title={`${label} ${year}`}>
                  <TooltipRow
                    color={chart.data.revenue}
                    label={t('products.colUnits')}
                    value={point.quantity.toLocaleString(locale)}
                  />
                  <TooltipRow
                    label={t('charts.revenue')}
                    value={formatMoney(point.revenue, { decimals: 2 })}
                  />
                </TooltipCard>
              );
            }}
          />
          <Bar
            dataKey="quantity"
            name={t('products.colUnits')}
            fill={chart.data.revenue}
            maxBarSize={28}
            shape={(p: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
              <path d={barPath(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0, true)} fill={p.fill} />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Every product, biggest takings first.
 *
 * The share is drawn as a bar in the row's own background rather than as a
 * fourth number: twenty percentages in a column have to be read one at a
 * time, whereas twenty bars of different length are one glance. The number
 * stays beside it, because a bar cannot be read precisely and the owner
 * sometimes needs the figure.
 */
function ProductTable({
  products, limit, onMore, selectedId, onPick,
}: {
  products: ProductTotals[];
  limit: number;
  onMore: () => void;
  selectedId: string | null;
  onPick: (product: ProductTotals) => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  if (products.length === 0) {
    return (
      <div className="card-glass p-8 text-center text-sm text-muted-foreground">
        {t('products.noMatches')}
      </div>
    );
  }

  // The widest share in view sets the full-width bar, so the shape of the
  // mix is visible even when the biggest line is 6% of the year.
  const widest = Math.max(...products.slice(0, limit).map((p) => p.share ?? 0), 1);
  const shown = products.slice(0, limit);

  return (
    <div className="card-glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('products.title')}</caption>
          <thead>
            <tr className="border-b border-border-subtle">
              <th scope="col" className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5">
                {t('products.colProduct')}
              </th>
              <th scope="col" className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5 hidden md:table-cell">
                {t('products.colFamilia')}
              </th>
              <th scope="col" className="text-right font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5">
                {t('products.colUnits')}
              </th>
              <th scope="col" className="text-right font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5">
                {t('products.colRevenue')}
              </th>
              <th scope="col" className="text-right font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5 w-28">
                {t('products.colShare')}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <tr
                  key={p.id}
                  onClick={() => onPick(p)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p); }
                  }}
                  className={`border-b border-border-subtle last:border-0 cursor-pointer transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring
                    ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'}`}
                >
                  <td className="px-4 py-2.5 min-w-0">
                    <span className="font-medium text-foreground">{p.name}</span>
                    {/* The family rides along on mobile too, where its own
                        column is hidden. The till sells the same dish under
                        two codes — à la carte in COMIDAS and inside a menu in
                        MENUS, at a different price — so two rows share a name
                        and the family is the only thing telling them apart. */}
                    <span className="block md:hidden text-[11px] text-muted-foreground mt-0.5">
                      {p.familia ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">
                    {p.familia ?? '—'}
                    {p.subFamily && <span className="opacity-60"> / {p.subFamily}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
                    {p.quantity.toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
                    {formatMoney(p.revenue)}
                  </td>
                  <td className="px-4 py-2.5">
                    {/* The bar is decoration over the number, not instead of
                        it: screen readers and precise reading both get the
                        figure. */}
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="hidden sm:block h-1.5 rounded-full bg-primary/70 shrink-0"
                        style={{ width: `${shareBarWidth(p.share, widest)}px` }}
                        aria-hidden="true"
                      />
                      <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">
                        {p.share === null ? '—' : `${p.share.toLocaleString(locale)}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {products.length > limit && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border-subtle">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('products.showingOf')
              .replace('{shown}', String(shown.length))
              .replace('{total}', String(products.length))}
          </span>
          <button
            type="button"
            onClick={onMore}
            className="text-xs font-semibold text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {t('products.showMore')}
          </button>
        </div>
      )}
    </div>
  );
}
