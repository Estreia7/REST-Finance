'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getComparativeData } from '../actions';
import { useChartTheme, tooltipProps } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import InfoHint from '@/app/components/InfoHint';

interface MonthData {
  label: string;
  revenue: number;
  costs: number;
  profit: number;
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
  const { t } = useLanguage();
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComparativeData().then(r => {
      if (r.success && r.data) setData(r.data as MonthData[]);
      setLoading(false);
    });
  }, []);

  const fmt = (n: number) => formatMoney(n);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  // Trends
  const current = data[data.length - 1];
  const previous = data[data.length - 2];
  const revChange = previous?.revenue ? ((current.revenue - previous.revenue) / previous.revenue * 100) : 0;
  const profitChange = previous?.profit ? ((current.profit - previous.profit) / Math.abs(previous.profit) * 100) : 0;

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
        <div className="card-glass p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {t('comparative.revenueVsPrev')}<InfoHint term="revenueVsPrev" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-bold ${revChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {revChange >= 0 ? '+' : ''}{revChange.toFixed(1)}%
            </span>
            {revChange >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
        </div>
        <div className="card-glass p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {t('comparative.profitVsPrev')}<InfoHint term="profitVsPrev" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-bold ${profitChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {profitChange >= 0 ? '+' : ''}{profitChange.toFixed(1)}%
            </span>
            {profitChange >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
        </div>
        <div className="card-glass p-4 col-span-2 md:col-span-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {t('comparative.monthlyAvg')}<InfoHint term="monthlyAvg" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {fmt(data.reduce((s, d) => s + d.revenue, 0) / Math.max(data.length, 1))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-bold text-foreground mb-1">{t('charts.titleMonthlyComparison')}</h3>
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
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
              barGap={3}
              barCategoryGap="22%"
              maxBarSize={22}
            >
              <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: chart.axis, fontSize: 11 }}
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
              {data.map((m, i) => (
                <tr key={i} className="border-b border-border-subtle">
                  <td className="py-2 text-foreground font-medium">{m.label}</td>
                  <td className="py-2 text-right text-muted-foreground">{fmt(m.revenue)}</td>
                  <td className="py-2 text-right text-red-400">{fmt(m.costs)}</td>
                  <td className={`py-2 text-right font-semibold ${m.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(m.profit)}</td>
                  <td className="py-2 text-right text-muted-foreground">{m.revenue > 0 ? (m.profit / m.revenue * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
