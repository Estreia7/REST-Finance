'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';

interface MonthlyItem {
  month: string;
  monthIndex?: number;
  year?: number;
  dineIn: number;
  takeaway: number;
  total: number;
}

interface RevenueChartProps {
  data: MonthlyItem[];
  /** The year on show. Omitted leaves the chart without its year control. */
  year?: number;
  onYearChange?: (year: number) => void;
  /** Years that actually have revenue, so the arrows stop at the edges. */
  availableYears?: number[];
}

/**
 * Month abbreviations, per language.
 *
 * Not `toLocaleDateString`: Portuguese returns "set." with a trailing dot and
 * in lower case, which reads as a typo along an axis, and twelve labels are
 * not worth twenty-four dictionary keys.
 */
const MONTH_SHORT: Record<string, string[]> = {
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-4 py-3 rounded-xl bg-card border border-border shadow-modal text-xs">
      <div className="font-semibold text-foreground mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold text-foreground">
            €{Number(p.value).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function RevenueChart({
  data,
  year,
  onYearChange,
  availableYears = [],
}: RevenueChartProps) {
  const chart = useChartTheme();
  // Series colours come from the theme, so they cannot live at module scope.
  const COLORS = [chart.primary, chart.info];
  const { t, language } = useLanguage();

  const names = MONTH_SHORT[language] ?? MONTH_SHORT.pt;

  // "Jan 26" rather than "2026-01": a year of twelve ISO labels is unreadable
  // at this width, and the two-digit year keeps the month legible while still
  // saying which year is on screen when the arrows have been used.
  const labelled = data.map((d) => {
    const [y, m] = d.month.split('-').map(Number);
    const index = d.monthIndex ?? (m - 1);
    return { ...d, label: `${names[index]} ${String(y).slice(-2)}` };
  });

  // Arrows stop at the edges of what was actually traded, so stepping back
  // never lands on an empty chart that reads as a bug.
  const oldest = availableYears.length ? Math.min(...availableYears) : undefined;
  const newest = availableYears.length ? Math.max(...availableYears) : undefined;
  const canGoBack = year !== undefined && oldest !== undefined && year > oldest;
  const canGoForward = year !== undefined && newest !== undefined && year < newest;

  const header = (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        <h3 className="font-bold text-foreground mb-1">{t('charts.titleRevenueByChannel')}</h3>
        <p className="text-xs text-muted-foreground">{t('charts.subRevenueByChannel')}</p>
      </div>

      {onYearChange && year !== undefined && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onYearChange(year - 1)}
            disabled={!canGoBack}
            aria-label={t('charts.previousYear')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted
                       disabled:opacity-30 disabled:hover:bg-transparent transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="text-sm font-semibold text-foreground tabular-nums w-12 text-center">
            {year}
          </span>

          <button
            type="button"
            onClick={() => onYearChange(year + 1)}
            disabled={!canGoForward}
            aria-label={t('charts.nextYear')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted
                       disabled:opacity-30 disabled:hover:bg-transparent transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );

  // A year with no trade still shows its controls, so the owner can step back
  // to one that has some rather than being stranded on an empty card.
  if (!labelled.some((d) => d.total > 0)) {
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
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={labelled} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
          <defs>
            <linearGradient id="gradDineIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={chart.primary} stopOpacity={0.4} />
              <stop offset="95%" stopColor={chart.primary} stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="gradTakeaway" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={chart.info} stopOpacity={0.4} />
              <stop offset="95%" stopColor={chart.info} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            // Twelve labels crowd on a phone; recharts drops the ones that do
            // not fit rather than overlapping them.
            interval="preserveStartEnd"
            minTickGap={4}
          />
          <YAxis
            tick={{ fontSize: 11, fill: chart.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `€${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
            formatter={(value) => <span style={{ color: chart.axis }}>{value}</span>}
          />
          <Area type="monotone" dataKey="dineIn"   name={t('charts.dineIn')}     stroke={chart.primary} fill="url(#gradDineIn)"   strokeWidth={2} />
          <Area type="monotone" dataKey="takeaway" name={t('charts.takeaway')} stroke={chart.info} fill="url(#gradTakeaway)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
