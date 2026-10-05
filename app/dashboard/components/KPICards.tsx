'use client';

import { TrendingUp, TrendingDown, DollarSign, BarChart3, Activity, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoney } from '@/lib/format';
import InfoHint from '@/app/components/InfoHint';
import TooltipHint from '@/app/components/Tooltip';
import { glossaryText } from '@/lib/glossary';
import { useLanguage } from '@/lib/language-context';

interface KPICardsProps {
  stats: {
    revenue: number;
    costs: number;
    profit: number;
    profitMargin: number;
  };
  advancedStats: {
    totalRevenue: number;
    revenueChange: number;
    primeCostPercent: number;
    netIncome: number;
    netIncomePercent: number;
    cogsPercent: number;
    cogsPercentChange: number;
    /** Null until the owner sets a target in GoalsPanel. */
    monthlyGoal: number | null;
    /** False when no cost category is flagged as labour — Prime Cost is then
     *  COGS-only and must be shown as incomplete, not as a healthy number. */
    hasLabourCategories?: boolean;
  };
  last7DaysData: Array<{ date: string; revenue: number }>;
  /**
   * How far through the month the restaurant is. Null until it loads, and on
   * a restaurant with nothing recorded this month.
   */
  monthProgress?: {
    elapsed: number;
    remaining: number;
    dailyAverage: number | null;
    projection: number | null;
  } | null;
}

/**
 * A bare green or red percentage says nothing about what it is measured
 * against, so the badge carries its own explanation rather than leaving the
 * reader to guess the comparison.
 */
function TrendBadge({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const { language } = useLanguage();
  const positive = inverted ? value < 0 : value >= 0;
  return (
    <TooltipHint text={glossaryText('trendBadge', language)} underline={false}>
      <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
        positive ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
      }`}>
        {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    </TooltipHint>
  );
}

function Sparkline({ data }: { data: Array<{ date: string; revenue: number }> }) {
  return (
    <div className="h-12 w-full mt-4 -mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="px-2 py-1 rounded-lg bg-card border border-border text-xs font-semibold text-foreground">
                  {formatMoney(Number(payload[0].value))}
                </div>
              ) : null
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function KPICards({
  stats: rawStats,
  advancedStats: rawAdvanced,
  last7DaysData,
  monthProgress = null,
}: KPICardsProps) {
  const { t } = useLanguage();
  const stats = {
    revenue: rawStats?.revenue ?? 0,
    costs: rawStats?.costs ?? 0,
    profit: rawStats?.profit ?? 0,
    profitMargin: rawStats?.profitMargin ?? 0,
  };

  const advancedStats = {
    totalRevenue: rawAdvanced?.totalRevenue ?? 0,
    revenueChange: rawAdvanced?.revenueChange ?? 0,
    primeCostPercent: rawAdvanced?.primeCostPercent ?? 0,
    netIncome: rawAdvanced?.netIncome ?? 0,
    netIncomePercent: rawAdvanced?.netIncomePercent ?? 0,
    cogsPercent: rawAdvanced?.cogsPercent ?? 0,
    cogsPercentChange: rawAdvanced?.cogsPercentChange ?? 0,
    monthlyGoal: rawAdvanced?.monthlyGoal ?? 0,
    hasLabourCategories: rawAdvanced?.hasLabourCategories ?? true,
  };

  // Without a labour category, Prime Cost is COGS-only and therefore far too
  // low. Never present that as a healthy figure.
  const primeCostIncomplete = !advancedStats.hasLabourCategories;

  const goalPercent = advancedStats.monthlyGoal > 0
    ? Math.min(100, (advancedStats.totalRevenue / advancedStats.monthlyGoal) * 100)
    : 0;

  // Three columns, not four: net profit left this row, and a four-column
  // grid would leave a hole at the end of it.
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* Revenue */}
      <div className="card-glass p-5 animate-fade-up-1">
        <div className="flex items-start justify-between mb-1">
          <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center ">
            <DollarSign className="w-4 h-4 text-primary-foreground" />
          </div>
          <TrendBadge value={advancedStats.revenueChange} />
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums text-foreground">
          €{advancedStats.totalRevenue.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {t('kpi.revenueThisMonth')}<InfoHint term="revenue" />
        </div>

        {/* How far through the month this figure is.
            A revenue number halfway through a month means nothing on its
            own, and the trading days are what make the average honest: a
            restaurant that shuts Mondays has four fewer days than the
            calendar claims. */}
        {monthProgress && monthProgress.elapsed > 0 && (
          <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{monthProgress.elapsed}</span>
              {' '}{t('kpi.daysElapsed')}
              {monthProgress.remaining > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-foreground tabular-nums">{monthProgress.remaining}</span>
                  {' '}{t('kpi.daysRemaining')}
                </>
              )}
            </p>
            {monthProgress.dailyAverage !== null && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">{t('kpi.dailyAverage')}</span>
                <span className="text-xs font-bold text-foreground tabular-nums">
                  {formatMoney(monthProgress.dailyAverage)}
                </span>
              </div>
            )}
            {monthProgress.projection !== null && monthProgress.remaining > 0 && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {t('kpi.estimate')}
                  <TooltipHint text={t('kpi.estimateHint')} underline={false}>
                    <span className="ml-1 cursor-help opacity-60" aria-hidden="true">?</span>
                  </TooltipHint>
                </span>
                <span className="text-xs font-bold text-primary tabular-nums">
                  {formatMoney(monthProgress.projection)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* An unlabelled line of peaks reads as decoration until something
            says which seven days it covers. */}
        {last7DaysData.length > 0 && (
          <>
            <Sparkline data={last7DaysData} />
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t('kpi.last7Days')}<InfoHint term="sparkline" />
            </div>
          </>
        )}
        {advancedStats.monthlyGoal > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{t('kpi.monthlyGoal')}<InfoHint term="target" /></span>
              <span>{goalPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full gradient-bg transition-all duration-1000"
                style={{ width: `${goalPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Prime Cost */}
      <div className="card-glass p-5 animate-fade-up-2">
        <div className="flex items-start justify-between mb-1">
          <div className="w-9 h-9 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-warning" />
          </div>
          {primeCostIncomplete ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              {t('kpi.incomplete')}
            </span>
          ) : (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              advancedStats.primeCostPercent > 65
                ? 'bg-danger/15 text-danger'
                : advancedStats.primeCostPercent > 60
                ? 'bg-warning/15 text-warning'
                : 'bg-success/15 text-success'
            }`}>
              {advancedStats.primeCostPercent > 65 ? t('kpi.high') : advancedStats.primeCostPercent > 60 ? t('kpi.watch') : t('kpi.good')}
            </span>
          )}
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums text-foreground">
          {advancedStats.primeCostPercent.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {t('kpi.primeCost')}<InfoHint term="primeCost" />
        </div>
        {primeCostIncomplete ? (
          <div className="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-warning/90">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" aria-hidden="true" />
            <span>
              {t('kpi.noLabourCategories')}
            </span>
          </div>
        ) : (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{t('kpi.targetUnder60')}</span>
              <span>{advancedStats.primeCostPercent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  advancedStats.primeCostPercent > 65 ? 'bg-danger' : advancedStats.primeCostPercent > 60 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(100, advancedStats.primeCostPercent)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Net profit used to sit here. It was removed rather than moved: the
          P&L says the same thing with the detail behind it, and the space
          now carries the ingredients ranking, which is something the owner
          can act on today. */}

      {/* COGS % — hidden on mobile */}
      <div className="card-glass p-5 animate-fade-up-4 hidden sm:block">
        <div className="flex items-start justify-between mb-1">
          <div className="w-9 h-9 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-info" />
          </div>
          <TrendBadge value={advancedStats.cogsPercentChange} inverted />
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums text-foreground">
          {advancedStats.cogsPercent.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          COGS %<InfoHint term="cogsPct" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-muted rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground">{t('kpi.revenue')}<InfoHint term="revenue" /></div>
            <div className="text-sm font-bold text-foreground mt-0.5">
              {formatMoney(stats.revenue)}
            </div>
          </div>
          <div className="bg-muted rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground">{t('kpi.costs')}<InfoHint term="costs" /></div>
            <div className="text-sm font-bold text-foreground mt-0.5">
              {formatMoney(stats.costs)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
