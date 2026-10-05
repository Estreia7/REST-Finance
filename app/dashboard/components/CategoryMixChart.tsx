'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/format';
import { ChartLegend, TooltipCard, TooltipRow, barPath, monthLabel } from './chart-parts';

/**
 * What was sold each month, by menu category.
 *
 * Replaces the channel donut, which showed a single slice every month for a
 * restaurant that does no takeaway — a card that answered nothing. The menu
 * mix is the thing an owner cannot see anywhere else: whether a good month
 * was carried by menus or by drinks, and whether that is shifting.
 *
 * Stacked bars rather than lines: the question is composition, and a stack
 * shows both the month's total and its parts in one mark.
 *
 * Drawn to be read, not just to be there. The bars are capped thin, so the
 * months stand apart instead of merging into a wall; a 2px gap in the card's
 * own colour separates each category, so neighbouring colours never bleed
 * into each other; only the top of each month's stack is rounded, whichever
 * category happens to be on top that month. The colours are a validated set,
 * in an order that keeps neighbours apart for colour-blind readers, and the
 * legend carries each category's share of the year so colour is never the
 * only clue.
 */

/** What the server calls the folded tail of small categories. */
const OTHER = 'Outras';
/** Space between stacked categories, in the card's colour. */
const GAP = 2;

interface CategoryMixChartProps {
  series: string[];
  data: Array<Record<string, number | string>>;
}

export default function CategoryMixChart({ series, data }: CategoryMixChartProps) {
  const { t, language } = useLanguage();
  const chart = useChartTheme();

  // Fixed order, never cycled: the server sends at most six categories plus
  // the folded rest, and the rest is always the neutral.
  const colorOf = (name: string, i: number) =>
    name === OTHER ? chart.data.other : chart.data.categories[i] ?? chart.data.other;
  const nameOf = (name: string) => (name === OTHER ? t('charts.mixOther') : name);

  const points: Array<Record<string, number | string>> = data.map((d) => ({
    ...d,
    label: monthLabel(String(d.month), language, typeof d.monthIndex === 'number' ? d.monthIndex : undefined),
  }));

  const yearTotals = series.map((s) => points.reduce((sum, d) => sum + Number(d[s] ?? 0), 0));
  const yearTotal = yearTotals.reduce((a, b) => a + b, 0);

  if (!series.length || yearTotal <= 0) {
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

  /** The category on top of a month's stack: the last one that sold. */
  const topOf = (d: Record<string, unknown>) => {
    for (let i = series.length - 1; i >= 0; i--) {
      if (Number(d[series[i]] ?? 0) > 0) return series[i];
    }
    return null;
  };

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-1">{t('charts.titleCategoryMix')}</h3>
      <p className="text-xs text-muted-foreground mb-4">{t('charts.subCategoryMix')}</p>

      <ChartLegend
        items={series.map((s, i) => ({
          key: s,
          color: colorOf(s, i),
          label: nameOf(s),
          value: formatPercent((yearTotals[i] / yearTotal) * 100, 0),
        }))}
      />

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
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
            width={48}
            tickFormatter={(v: number) => formatMoneyCompact(v)}
          />
          <Tooltip
            cursor={{ fill: chart.grid, opacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              // Zero bands are in the payload but say nothing. Listed top to
              // bottom, the way the stack reads.
              const rows = payload.filter((p) => Number(p.value) > 0).reverse();
              if (!rows.length) return null;
              const total = rows.reduce((s, p) => s + Number(p.value), 0);
              return (
                <TooltipCard title={String(label)}>
                  {rows.map((p) => {
                    const key = String(p.dataKey);
                    const value = Number(p.value);
                    return (
                      <TooltipRow
                        key={key}
                        color={colorOf(key, series.indexOf(key))}
                        label={`${nameOf(key)} · ${formatPercent((value / total) * 100, 0)}`}
                        value={formatMoney(value, { decimals: 2 })}
                      />
                    );
                  })}
                  <div className="pt-1.5 mt-1.5 border-t border-border-subtle">
                    <TooltipRow label={t('charts.total')} value={formatMoney(total, { decimals: 2 })} strong />
                  </div>
                </TooltipCard>
              );
            }}
          />
          {series.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              name={nameOf(name)}
              stackId="mix"
              fill={colorOf(name, i)}
              maxBarSize={24}
              shape={(p: {
                x?: number; y?: number; width?: number; height?: number; fill?: string;
                payload?: Record<string, unknown>;
              }) => {
                const isTop = p.payload ? topOf(p.payload) === name : false;
                const height = p.height ?? 0;
                // Every segment but the top gives up its upper 2px, which is
                // the gap to the one above it. A sliver thinner than the gap
                // is still drawn, at 1px, so a small category never vanishes.
                const trim = isTop ? 0 : Math.min(GAP, Math.max(0, height - 1));
                return (
                  <path
                    d={barPath(p.x ?? 0, (p.y ?? 0) + trim, p.width ?? 0, height - trim, isTop)}
                    fill={p.fill}
                  />
                );
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
