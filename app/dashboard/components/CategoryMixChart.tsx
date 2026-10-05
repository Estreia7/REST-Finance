'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';

/**
 * What was sold each month, by menu category.
 *
 * Replaces the channel donut, which showed a single slice every month for a
 * restaurant that does no takeaway — a card that answered nothing. The menu
 * mix is the thing an owner cannot see anywhere else: whether a good month
 * was carried by menus or by drinks, and whether that is shifting.
 *
 * Stacked bars rather than lines: the question is composition, and a stack
 * shows both the month's total and its parts in one mark. Lines would answer
 * "is BEBIDAS growing" at the cost of the total, which the chart above
 * already covers.
 */

interface CategoryMixChartProps {
  series: string[];
  data: Array<Record<string, number | string>>;
}

/** The same abbreviations the revenue chart uses, so the two axes read alike. */
const MONTH_SHORT: Record<string, string[]> = {
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  // Zero-value bands are in the payload but say nothing; a month with three
  // categories should not show a tooltip listing seven.
  const rows = payload.filter((p: any) => Number(p.value) > 0);
  if (!rows.length) return null;

  const total = rows.reduce((s: number, p: any) => s + Number(p.value), 0);

  return (
    <div className="px-4 py-3 rounded-xl bg-card border border-border shadow-modal text-xs">
      <div className="font-semibold text-foreground mb-2">{label}</div>
      {rows.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold text-foreground tabular-nums">
            €{Number(p.value).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-6 mt-1.5 pt-1.5 border-t border-border-subtle">
        <span className="text-muted-foreground">Total</span>
        <span className="font-bold text-foreground tabular-nums">
          €{total.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
};

export default function CategoryMixChart({ series, data }: CategoryMixChartProps) {
  const { t, language } = useLanguage();
  const chart = useChartTheme();

  const names = MONTH_SHORT[language] ?? MONTH_SHORT.pt;

  // Theme colours first, so the chart matches the rest of the dashboard, then
  // a spread of warm and cool tones that stay apart from each other.
  const palette = [
    chart.primary, chart.info, '#8b5cf6', '#10b981',
    '#f43f5e', '#64748b', '#d4a373',
  ];

  const labelled: Array<Record<string, number | string>> = data.map((d) => {
    const [y, m] = String(d.month).split('-').map(Number);
    const index = typeof d.monthIndex === 'number' ? d.monthIndex : m - 1;
    return { ...d, label: `${names[index]} ${String(y).slice(-2)}` };
  });

  const hasAny = labelled.some((d) =>
    series.some((s) => Number(d[s] ?? 0) > 0)
  );

  if (!series.length || !hasAny) {
    return (
      <div className="card-glass p-6">
        <h3 className="font-bold text-foreground mb-1">{t('charts.titleCategoryMix')}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t('charts.subCategoryMix')}</p>
        <div className="flex items-center justify-center h-40 text-center text-sm text-muted-foreground px-6">
          {t('charts.categoryMixEmpty')}
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-1">{t('charts.titleCategoryMix')}</h3>
      <p className="text-xs text-muted-foreground mb-5">{t('charts.subCategoryMix')}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={labelled} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={4}
          />
          <YAxis
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `€${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: chart.grid, opacity: 0.3 }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            formatter={(value) => <span style={{ color: chart.axis }}>{value}</span>}
          />
          {series.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="mix"
              fill={palette[i % palette.length]}
              // Only the top band is rounded, or every segment gets a notch
              // where it meets the one above.
              radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
