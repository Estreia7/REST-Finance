'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getComparativeData } from '../actions';
import { useChartTheme, tooltipProps } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { percentChange } from '@/lib/kpi';
import type { MonthFigures, YearComparison, CumulativeSales } from '@/lib/comparative';
import CumulativeSalesChart from './CumulativeSalesChart';
import InfoHint from '@/app/components/InfoHint';

type MonthData = MonthFigures;

/** A month's margin, as a percentage of its takings; null with no takings. */
function marginOf(revenue: number, profit: number): number | null {
  return revenue > 0 ? (profit / revenue) * 100 : null;
}

/**
 * How a figure moved against the same month last year.
 *
 * Whether up is good depends on the figure: more revenue and more profit are,
 * more costs are not, so the colour follows the meaning rather than the sign.
 * A base of zero has no percentage — "up 100%" from nothing says nothing —
 * and shows as a dash.
 */
function YearChange({
  current, previous, upIsGood = true, points = false, locale, previousLabel,
}: {
  current: number | null;
  previous: number | null;
  upIsGood?: boolean;
  /** Margin moves in percentage points, not in percent of itself. */
  points?: boolean;
  locale: string;
  /** Last year's figure, written out, shown beside the change. */
  previousLabel?: string;
}) {
  if (current === null || previous === null) return <span className="block text-[11px] text-muted-foreground">—</span>;
  const delta = points ? current - previous : previous === 0 ? null : percentChange(current, previous) * 100;
  if (delta === null) {
    return <span className="block text-[11px] text-muted-foreground">{previousLabel ?? '—'}</span>;
  }
  const flat = Math.abs(delta) < 0.05;
  const up = delta > 0;
  const good = flat ? null : up === upIsGood;
  const tone = good === null ? 'text-muted-foreground' : good ? 'text-green-400' : 'text-red-400';
  const Icon = up ? TrendingUp : TrendingDown;
  const value = Math.abs(delta).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span className="block text-[11px] tabular-nums whitespace-nowrap">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        {!flat && <Icon className="w-3 h-3" aria-hidden="true" />}
        {flat ? '' : up ? '+' : '−'}{value}{points ? ' pp' : '%'}
      </span>
      {previousLabel && <span className="text-muted-foreground"> · {previousLabel}</span>}
    </span>
  );
}

/**
 * The month as a person would say it: "Setembro 2026", "September 2026".
 *
 * Name and year are formatted separately and joined by hand rather than asked
 * for together. Portuguese returns `month: 'short'` as a *number* — which is
 * where "04/26" came from — and spells the long form "setembro de 2026", with
 * a connective and a lowercase name that a column of months does not want.
 * Asking for the month on its own gets the name in both languages.
 *
 * Two lengths because the same six months are read in two places: the chart
 * fits six ticks across a phone, so it gets the abbreviation, while the table
 * has a column of its own and gets the month written out.
 */
function monthLabel(m: MonthData, locale: string, style: 'short' | 'long'): string {
  const date = new Date(m.year, m.month, 1);
  const name = date.toLocaleDateString(locale, { month: style });
  // Portuguese month names are lowercase; at the head of a label they read as
  // a typo. Abbreviations also carry a trailing dot ("set.") that the year
  // would otherwise follow.
  const titled = name.charAt(0).toUpperCase() + name.slice(1).replace(/\.$/, '');
  // Six ticks share the width of a phone, so the chart takes the short year.
  const year = style === 'short' ? `'${String(m.year).slice(-2)}` : m.year;
  return `${titled} ${year}`;
}

/**
 * The month alone, abbreviated, for a chart that shows one year: the year is
 * in the title, and twelve ticks have no room to repeat it.
 */
function shortMonth(m: MonthData, locale: string): string {
  const name = new Date(m.year, m.month, 1).toLocaleDateString(locale, { month: 'short' });
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/.$/, '');
}

/**
 * A headline change against the same period last year.
 *
 * The period is written under the figure, because "+12%" means nothing until
 * it says against what — and while the month runs, against what is the same
 * days of last year's month, not all of it.
 */
function TrendCard({
  label, term, change, now, then, period,
}: {
  label: string;
  term: 'revenueVsPrev' | 'profitVsPrev';
  change: number | null;
  now: string;
  then: string | null;
  period: string;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const up = (change ?? 0) >= 0;
  return (
    <div className="card-glass p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
        {label}<InfoHint term={term} />
      </div>
      <div className="flex items-center gap-2">
        {change === null ? (
          <span className="text-xl font-bold text-muted-foreground">—</span>
        ) : (
          <>
            <span className={`text-xl font-bold tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '+' : '−'}{Math.abs(change).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
            {up ? <TrendingUp className="w-4 h-4 text-green-400" aria-hidden="true" /> : <TrendingDown className="w-4 h-4 text-red-400" aria-hidden="true" />}
          </>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{period}</p>
      {then !== null && (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          <span className="text-foreground font-medium">{now}</span>{' '}
          {t('comparative.vsLastYear').replace('{month}', then)}
        </p>
      )}
    </div>
  );
}

/**
 * Gridlines drawn on the comparison chart, including the zero line. A chart
 * that dips below zero is allowed one extra so the negative side gets its own
 * step without coarsening the scale above zero.
 */
const TICK_COUNT = 4;
const TICK_COUNT_WITH_LOSS = 5;

/** Step sizes people read easily, as multiples of a power of ten. */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];

/**
 * Axis bounds for the comparison chart.
 *
 * Recharts otherwise rounds the top tick up to the next round number, which on
 * six months of real figures left roughly a third of the card empty above the
 * tallest bar. Both bounds are derived from a single step so that every tick
 * is evenly spaced and zero always falls exactly on a gridline — without that,
 * a month in the red renders with no baseline to read the loss against.
 */
function axisBounds(min: number, max: number): { domain: [number, number]; tickCount: number } {
  // A tenth of headroom keeps the tallest bar off the top of the plot. The
  // floor gets none: a small loss against a large revenue would otherwise be
  // rounded further down and leave the lower half of the card empty, which is
  // the same waste this is meant to avoid.
  const low = Math.min(0, min);
  const high = Math.max(0, max) * 1.1;
  const tickCount = low < 0 ? TICK_COUNT_WITH_LOSS : TICK_COUNT;
  if (high - low === 0) return { domain: [0, TICK_COUNT - 1], tickCount: TICK_COUNT };

  // The step has to cover the whole span in the gaps available, and the
  // negative side consumes some of them, so take the first readable step that
  // fits both halves at a whole number of gaps each.
  const gaps = tickCount - 1;
  const magnitude = 10 ** Math.floor(Math.log10((high - low) / gaps));

  for (const n of NICE_STEPS) {
    const step = n * magnitude;
    const below = Math.ceil(-low / step);
    const above = Math.ceil(high / step);
    if (below + above <= gaps) {
      return { domain: [-below * step, above * step], tickCount: below + above + 1 };
    }
  }

  const step = 10 * magnitude;
  const below = Math.ceil(-low / step);
  const above = Math.ceil(high / step);
  return { domain: [-below * step, above * step], tickCount: below + above + 1 };
}

export default function ComparativePanel() {
  const chart = useChartTheme();
  // Series colours come from the theme, so they cannot live at module scope.
  const COLORS = [chart.primary, chart.info];
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [comparison, setComparison] = useState<YearComparison | null>(null);
  const [cumulative, setCumulative] = useState<CumulativeSales | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComparativeData().then(r => {
      if (r.success && r.data) {
        setComparison(r.data.comparison as YearComparison);
        setCumulative(r.data.cumulative as CumulativeSales);
      }
      setLoading(false);
    });
  }, []);

  const fmt = (n: number) => formatMoney(n);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!comparison) return null;

  // The whole year on the chart; the table stops at this month, since rows
  // for months still to come would be columns of zeros.
  const data = comparison.months;
  const current = comparison.current;
  const tableMonths = data.filter(m => m.month <= current.month);

  // The month in progress against the same days a year ago — the period is
  // said under the figure, so "+12%" is never read as a whole month's change.
  const lastMonthName = monthLabel({ ...current, year: current.year - 1 }, locale, 'long');
  const period = !current.lastYear
    ? t('comparative.noLastYearPeriod').replace('{month}', lastMonthName)
    : current.throughDay
      ? t('comparative.periodRunning')
          .replace('{month}', monthLabel(current, locale, 'long'))
          .replace('{day}', String(current.throughDay))
          .replace('{year}', String(current.year - 1))
      : t('comparative.periodFull')
          .replace('{month}', monthLabel(current, locale, 'long'))
          .replace('{lastMonth}', lastMonthName);
  const revChange = current.lastYear && current.lastYear.revenue !== 0
    ? percentChange(current.revenue, current.lastYear.revenue) * 100 : null;
  const profitChange = current.lastYear && current.lastYear.profit !== 0
    ? percentChange(current.profit, current.lastYear.profit) * 100 : null;

  const chartData = data.map(m => ({ ...m, label: shortMonth(m, locale) }));

  // Revenue is always the tallest series and profit the only one that can go
  // negative, so those two bracket the chart.
  const yAxis = axisBounds(
    Math.min(0, ...data.map(d => d.profit)),
    Math.max(0, ...data.map(d => d.revenue)),
  );

  return (
    <div className="space-y-4">
      {/* Trend cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <TrendCard
          label={t('comparative.revenueVsLastYear')}
          term="revenueVsPrev"
          change={revChange}
          now={fmt(current.revenue)}
          then={current.lastYear ? fmt(current.lastYear.revenue) : null}
          period={period}
        />
        <TrendCard
          label={t('comparative.profitVsLastYear')}
          term="profitVsPrev"
          change={profitChange}
          now={fmt(current.profit)}
          then={current.lastYear ? fmt(current.lastYear.profit) : null}
          period={period}
        />
        <div className="card-glass p-4 col-span-2 md:col-span-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {t('comparative.monthlyAvg')}<InfoHint term="monthlyAvg" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {fmt(comparison.averageSixMonths)}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-bold text-foreground mb-1">{t('charts.titleMonthlyComparison').replace('{year}', String(comparison.year))}</h3>
        <p className="text-xs text-muted-foreground mb-5">{t('charts.subMonthlyComparison')}</p>
        <div className="h-[280px] sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            {/*
              Only six months are ever plotted, so without a cap Recharts spreads
              the three series across the full card width and every bar reads as
              a slab. `maxBarSize` keeps them slim; the category gap gives each
              month its own cluster instead of one continuous wall.
            */}
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
              barGap={2}
              barCategoryGap="18%"
              maxBarSize={16}
            >
              <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                tick={{ fill: chart.axis, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: chart.grid }}
                tickMargin={8}
              />
              <YAxis
                tick={{ fill: chart.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
                domain={yAxis.domain}
                tickCount={yAxis.tickCount}
                tickFormatter={v => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`)}
              />
              <Tooltip
                {...tooltipProps(chart)}
                cursor={{ fill: chart.grid, opacity: 0.35 }}
                formatter={(value: number) => [fmt(value)]}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" iconSize={8} />
              <Bar dataKey="revenue" name={t('charts.revenue')} fill={chart.primary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="costs" name={t('charts.costs')} fill={chart.danger} radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name={t('charts.profit')} fill={chart.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sales accumulated through the year, other years added from the legend. */}
      {cumulative && <CumulativeSalesChart data={cumulative} />}

      {/* Monthly table */}
      <div className="card-glass p-6">
        <h3 className="text-sm font-bold text-foreground mb-1">{t('charts.titleMonthlyDetail')}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t('charts.subMonthlyDetail')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">{t('comparative.month')}</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">
                  {t('charts.revenue')}<InfoHint term="revenue" />
                </th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">
                  {t('charts.costs')}<InfoHint term="costs" />
                </th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">
                  {t('charts.profit')}<InfoHint term="netIncome" />
                </th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">
                  {t('comparative.margin')}<InfoHint term="margin" />
                </th>
              </tr>
            </thead>
            <tbody>
              {tableMonths.map((m, i) => {
                const ly = m.lastYear;
                const margin = marginOf(m.revenue, m.profit);
                const lastMargin = ly ? marginOf(ly.revenue, ly.profit) : null;
                const lastMonth = monthLabel({ ...m, year: m.year - 1 }, locale, 'long');
                return (
                  <tr key={i} className="border-b border-border-subtle align-top">
                    <td className="py-2.5 pr-3 text-foreground font-medium whitespace-nowrap">
                      {monthLabel(m, locale, 'long')}
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {ly
                          ? m.throughDay
                            ? t('comparative.vsLastYearToDay').replace('{month}', lastMonth).replace('{day}', String(m.throughDay))
                            : t('comparative.vsLastYear').replace('{month}', lastMonth)
                          : t('comparative.noLastYear').replace('{year}', String(m.year - 1))}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-muted-foreground">
                      {fmt(m.revenue)}
                      {ly && <YearChange current={m.revenue} previous={ly.revenue} locale={locale} previousLabel={fmt(ly.revenue)} />}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-red-400">
                      {fmt(m.costs)}
                      {ly && <YearChange current={m.costs} previous={ly.costs} upIsGood={false} locale={locale} previousLabel={fmt(ly.costs)} />}
                    </td>
                    <td className={`py-2.5 pl-3 text-right tabular-nums font-semibold ${m.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(m.profit)}
                      {ly && <YearChange current={m.profit} previous={ly.profit} locale={locale} previousLabel={fmt(ly.profit)} />}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-muted-foreground">
                      {margin === null ? '—' : `${margin.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                      {ly && <YearChange current={margin} previous={lastMargin} points locale={locale} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
