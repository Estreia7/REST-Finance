'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import { percentChange } from '@/lib/kpi';
import { axisIndex, type CumulativeSales } from '@/lib/comparative';

/** The first day of each month on the shared axis, for the ticks. */
const MONTH_TICKS = Array.from({ length: 12 }, (_, m) => axisIndex(m, 1));

/** An axis day back to a calendar day, on the leap reference year. */
function axisDate(index: number): Date {
  return new Date(Date.UTC(2024, 0, 1) + index * 86_400_000);
}

/**
 * Sales accumulated since 1 January, one line per year.
 *
 * Opens on this year alone, ending at today. Other years are added from the
 * legend, so the comparison is something the owner asks for rather than a
 * tangle of lines on arrival — and the year they add is laid over the same
 * January-to-December axis, so "where were we by now last year" is read
 * straight off the chart.
 */
export default function CumulativeSalesChart({ data }: { data: CumulativeSales }) {
  const chart = useChartTheme();
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const thisYear = data.years[0] ?? null;
  const [shown, setShown] = useState<Set<number>>(() => new Set(thisYear !== null ? [thisYear] : []));

  if (thisYear === null) {
    return (
      <div className="card-glass p-6">
        <h3 className="text-lg font-bold text-foreground mb-1">{t('comparative.cumulativeTitle')}</h3>
        <p className="text-sm text-muted-foreground py-10 text-center">{t('comparative.cumulativeEmpty')}</p>
      </div>
    );
  }

  // This year in the brand colour, the others in hues kept apart from it.
  const palette = [chart.info, chart.success, chart.warning, chart.danger, chart.axis];
  const colourOf = (year: number) =>
    year === thisYear ? chart.primary : palette[(data.years.indexOf(year) - 1) % palette.length];

  const toggle = (year: number) =>
    setShown((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year); else next.add(year);
      // This year stays: it is what every other line is compared with.
      next.add(thisYear);
      return next;
    });

  const dayLabel = (index: number, month: 'short' | 'long' = 'short') =>
    axisDate(index).toLocaleDateString(locale, { day: 'numeric', month, timeZone: 'UTC' });
  const monthTick = (index: number) => {
    const name = axisDate(index).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }).replace(/\.$/, '');
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const { current, lastYear } = data.toDate;
  const change = lastYear ? percentChange(current, lastYear) * 100 : null;
  const up = (change ?? 0) >= 0;

  return (
    <div className="card-glass p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-5">
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1">{t('comparative.cumulativeTitle')}</h3>
          <p className="text-xs text-muted-foreground max-w-prose">{t('comparative.cumulativeSub')}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">
            {t('comparative.cumulativeToDate').replace('{date}', dayLabel(data.todayIndex, 'long'))}
          </p>
          <p className="text-xl font-bold tabular-nums text-foreground">{formatMoney(current)}</p>
          {change !== null && (
            <p className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
              {t('comparative.cumulativeVsLastYear')
                .replace('{change}', `${up ? '+' : '−'}${Math.abs(change).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`)
                .replace('{year}', String(thisYear - 1))}
            </p>
          )}
        </div>
      </div>

      <div className="h-[260px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, 365]}
              ticks={MONTH_TICKS}
              tickFormatter={monthTick}
              tick={{ fill: chart.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chart.grid }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={4}
            />
            <YAxis
              tick={{ fill: chart.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`)}
            />
            <ReferenceLine
              x={data.todayIndex}
              stroke={chart.axis}
              strokeDasharray="3 3"
              label={{ value: t('comparative.today'), position: 'insideTopLeft', fill: chart.axis, fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: chart.grid }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
                    <p className="text-muted-foreground mb-1">{dayLabel(Number(label), 'long')}</p>
                    {payload
                      .filter((p) => p.value !== null && p.value !== undefined)
                      .map((p) => (
                        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 tabular-nums">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                            {String(p.dataKey)}
                          </span>
                          <span className="font-semibold text-foreground">{formatMoney(Number(p.value))}</span>
                        </p>
                      ))}
                  </div>
                );
              }}
            />
            {[...data.years].reverse().filter((y) => shown.has(y)).map((year) => (
              <Line
                key={year}
                dataKey={String(year)}
                name={String(year)}
                stroke={colourOf(year)}
                strokeWidth={year === thisYear ? 2.5 : 1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* The legend is the control: each year a switch, this year always on. */}
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('comparative.cumulativeYears')}>
        {data.years.map((year) => {
          const on = shown.has(year);
          const fixed = year === thisYear;
          return (
            <button
              key={year}
              type="button"
              onClick={() => !fixed && toggle(year)}
              aria-pressed={on}
              disabled={fixed}
              title={fixed ? undefined : t('comparative.showYear').replace('{year}', String(year))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
                on ? 'border-border bg-card text-foreground shadow-sm' : 'border-dashed border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: on ? colourOf(year) : 'transparent', boxShadow: on ? undefined : `inset 0 0 0 1.5px ${colourOf(year)}` }}
                aria-hidden="true"
              />
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}
