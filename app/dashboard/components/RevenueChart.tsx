'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { ChartHeader, ChartLegend, TooltipCard, TooltipRow, barPath, monthLabel, useTooltipTrigger } from './chart-parts';

/**
 * Revenue against costs, month by month.
 *
 * Replaces the revenue-by-channel area chart, which split the takings into
 * dine-in and takeaway — for most restaurants a single band every month, and
 * no answer to the question an owner actually brings to this card: did more
 * come in than went out?
 *
 * Two thin bars per month, side by side on one axis. Thin on purpose: a bar
 * that fills its slot reads as a block and the eye loses which month it
 * belongs to; capped narrow, the air between months does the grouping.
 */

interface MonthlyItem {
  month: string;
  monthIndex?: number;
  year?: number;
  dineIn: number;
  takeaway: number;
  total: number;
  costs: number;
}

interface RevenueChartProps {
  data: MonthlyItem[];
  /** The year on show. Omitted leaves the chart without its year control. */
  year?: number;
  onYearChange?: (year: number) => void;
  /** Years that actually have revenue, so the arrows stop at the edges. */
  availableYears?: number[];
}

export default function RevenueChart({
  data,
  year,
  onYearChange,
  availableYears = [],
}: RevenueChartProps) {
  const chart = useChartTheme();
  const tooltipTrigger = useTooltipTrigger();
  const { t, language } = useLanguage();

  const points = data.map((d) => ({
    label: monthLabel(d.month, language, d.monthIndex),
    revenue: d.total,
    costs: d.costs ?? 0,
  }));

  const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
  const totalCosts = points.reduce((s, p) => s + p.costs, 0);

  const header = (
    <ChartHeader
      title={t('charts.titleRevenueCosts')}
      subtitle={t('charts.subRevenueCosts')}
      year={year}
      onYearChange={onYearChange}
      availableYears={availableYears}
    />
  );

  // A year with no trade still shows its controls, so the owner can step back
  // to one that has some rather than being stranded on an empty card.
  if (totalRevenue <= 0 && totalCosts <= 0) {
    return (
      <div className="card-glass p-6">
        {header}
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t('charts.noDataForYear')}
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      {header}

      {/* The year's totals ride the legend: the colour is never the only
          thing saying which bar is which, and the sum is there without a
          hover. */}
      <ChartLegend
        items={[
          { key: 'revenue', color: chart.data.revenue, label: t('charts.revenue'), value: formatMoney(totalRevenue) },
          { key: 'costs', color: chart.data.costs, label: t('charts.costs'), value: formatMoney(totalCosts) },
        ]}
      />

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={points}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          // Two bars a month with a 2px gap between them; the space between
          // months is wider than the bars, so each pair reads as one month.
          barGap={2}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            // All twelve on a laptop; on a phone the ones that would collide
            // are dropped rather than drawn over each other.
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
              const revenue = Number(payload.find((p) => p.dataKey === 'revenue')?.value ?? 0);
              const costs = Number(payload.find((p) => p.dataKey === 'costs')?.value ?? 0);
              const diff = revenue - costs;
              return (
                <TooltipCard title={`${label} ${year ?? ''}`.trim()}>
                  <TooltipRow color={chart.data.revenue} label={t('charts.revenue')} value={formatMoney(revenue, { decimals: 2 })} />
                  <TooltipRow color={chart.data.costs} label={t('charts.costs')} value={formatMoney(costs, { decimals: 2 })} />
                  <div className="pt-1.5 mt-1.5 border-t border-border-subtle">
                    <TooltipRow
                      label={t('charts.difference')}
                      value={`${diff < 0 ? '−' : '+'}${formatMoney(Math.abs(diff), { decimals: 2 })}`}
                      strong
                    />
                  </div>
                </TooltipCard>
              );
            }}
          />
          <Bar
            dataKey="revenue"
            name={t('charts.revenue')}
            fill={chart.data.revenue}
            maxBarSize={14}
            shape={(p: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
              <path d={barPath(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0, true)} fill={p.fill} />
            )}
          />
          <Bar
            dataKey="costs"
            name={t('charts.costs')}
            fill={chart.data.costs}
            maxBarSize={14}
            shape={(p: { x?: number; y?: number; width?: number; height?: number; fill?: string }) => (
              <path d={barPath(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0, true)} fill={p.fill} />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
