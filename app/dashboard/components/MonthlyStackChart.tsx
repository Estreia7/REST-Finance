'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/format';
import { OTHER_SERIES, UNCATEGORISED_SERIES } from '@/lib/monthly-series';
import { ChartHeader, ChartLegend, TooltipCard, TooltipRow, barPath, monthLabel, useTooltipTrigger } from './chart-parts';

/**
 * A year of amounts by category, one stacked bar a month.
 *
 * Used twice on the dashboard: what was sold, by menu category, and what was
 * spent, by cost category. The same chart for both so they read as a pair —
 * where a month's money came from, and where it went.
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

/** Space between stacked categories, in the card's colour. */
const GAP = 2;

interface MonthlyStackChartProps {
  title: string;
  subtitle: string;
  /** Said when the year on show has nothing to draw. */
  emptyText: string;
  series: string[];
  data: Array<Record<string, number | string>>;
  year?: number;
  onYearChange?: (year: number) => void;
  availableYears?: number[];
}

export default function MonthlyStackChart({
  title, subtitle, emptyText, series, data, year, onYearChange, availableYears,
}: MonthlyStackChartProps) {
  const { t, language } = useLanguage();
  const chart = useChartTheme();
  const tooltipTrigger = useTooltipTrigger();

  // Fixed order, never cycled: the server sends at most six categories plus
  // the folded rest, and the rest is always the neutral.
  const colorOf = (name: string, i: number) =>
    name === OTHER_SERIES ? chart.data.other : chart.data.categories[i] ?? chart.data.other;
  const nameOf = (name: string) =>
    name === OTHER_SERIES ? t('charts.mixOther')
    : name === UNCATEGORISED_SERIES ? t('charts.mixUncategorised')
    : name;

  const points: Array<Record<string, number | string>> = data.map((d) => ({
    ...d,
    label: monthLabel(String(d.month), language, typeof d.monthIndex === 'number' ? d.monthIndex : undefined),
  }));

  const yearTotals = series.map((s) => points.reduce((sum, d) => sum + Number(d[s] ?? 0), 0));
  const yearTotal = yearTotals.reduce((a, b) => a + b, 0);

  const header = (
    <ChartHeader
      title={title}
      subtitle={subtitle}
      year={year}
      onYearChange={onYearChange}
      availableYears={availableYears}
    />
  );

  // A year with nothing still shows its arrows, so the owner can step to one
  // that has something rather than being stranded on an empty card.
  if (!series.length || yearTotal <= 0) {
    return (
      <div className="card-glass p-6">
        {header}
        <div className="flex items-center justify-center h-40 text-center text-sm text-muted-foreground px-6">
          {emptyText}
        </div>
      </div>
    );
  }

  /** The category on top of a month's stack: the last one with an amount. */
  const topOf = (d: Record<string, unknown>) => {
    for (let i = series.length - 1; i >= 0; i--) {
      if (Number(d[series[i]] ?? 0) > 0) return series[i];
    }
    return null;
  };

  return (
    <div className="card-glass p-6">
      {header}

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
            trigger={tooltipTrigger}
            cursor={{ fill: chart.grid, opacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              // Zero bands are in the payload but say nothing. Listed top to
              // bottom, the way the stack reads.
              const rows = payload.filter((p) => Number(p.value) > 0).reverse();
              if (!rows.length) return null;
              const total = rows.reduce((s, p) => s + Number(p.value), 0);
              return (
                <TooltipCard title={`${label} ${year ?? ''}`.trim()}>
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
              stackId="stack"
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
