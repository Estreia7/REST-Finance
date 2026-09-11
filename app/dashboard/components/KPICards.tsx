'use client';

import { TrendingUp, TrendingDown, DollarSign, BarChart3, Target, Activity, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

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
}

function TrendBadge({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const positive = inverted ? value < 0 : value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
      positive ? 'bg-success/15 text-green-400' : 'bg-danger/15 text-red-400'
    }`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Sparkline({ data }: { data: Array<{ date: string; revenue: number }> }) {
  return (
    <div className="h-12 w-full mt-4 -mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(258 90% 66%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(258 90% 66%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="revenue" stroke="hsl(258 90% 66%)" strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="px-2 py-1 rounded-lg bg-card border border-white/10 text-xs font-semibold text-foreground">
                  €{Number(payload[0].value).toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
                </div>
              ) : null
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function KPICards({ stats: rawStats, advancedStats: rawAdvanced, last7DaysData }: KPICardsProps) {
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

  // Circular gauge values for Net Income
  const radius = 28;
  const circ   = 2 * Math.PI * radius;
  const netPct = Math.max(0, Math.min(100, advancedStats.netIncomePercent));
  const dash   = (netPct / 100) * circ;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

      {/* Revenue */}
      <div className="card-glass p-5 animate-fade-up-1">
        <div className="flex items-start justify-between mb-1">
          <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shadow-glow-sm">
            <DollarSign className="w-4 h-4 text-white" />
          </div>
          <TrendBadge value={advancedStats.revenueChange} />
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums text-foreground">
          €{advancedStats.totalRevenue.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Receita este mês</div>
        {last7DaysData.length > 0 && <Sparkline data={last7DaysData} />}
        {advancedStats.monthlyGoal > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Meta mensal</span>
              <span>{goalPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
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
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          {primeCostIncomplete ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warning/15 text-amber-400">
              Incompleto
            </span>
          ) : (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              advancedStats.primeCostPercent > 65
                ? 'bg-danger/15 text-red-400'
                : advancedStats.primeCostPercent > 60
                ? 'bg-warning/15 text-amber-400'
                : 'bg-success/15 text-green-400'
            }`}>
              {advancedStats.primeCostPercent > 65 ? 'Alto' : advancedStats.primeCostPercent > 60 ? 'Atenção' : 'Bom'}
            </span>
          )}
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums text-foreground">
          {advancedStats.primeCostPercent.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground mt-1">Prime Cost</div>
        {primeCostIncomplete ? (
          <div className="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-400/90">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" aria-hidden="true" />
            <span>
              Sem categorias de pessoal definidas — este valor inclui apenas mercadorias.
              Marca as categorias de ordenados nas definições.
            </span>
          </div>
        ) : (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Meta &lt;60%</span>
              <span>{advancedStats.primeCostPercent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
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

      {/* Net Income — hidden on mobile */}
      <div className="card-glass p-5 animate-fade-up-3 hidden sm:block">
        <div className="flex items-start justify-between mb-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-green-400" />
          </div>
          <TrendBadge value={advancedStats.netIncomePercent} />
        </div>
        <div className="flex items-end gap-4 mt-3">
          <div>
            <div className="text-3xl font-black tabular-nums text-foreground">
              €{Math.abs(advancedStats.netIncome).toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Lucro Líquido</div>
          </div>
          {/* Circular gauge */}
          <svg width="68" height="68" className="shrink-0 ml-auto" role="img" aria-label={`Lucro líquido: ${netPct.toFixed(0)}%`}>
            <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
            <circle
              cx="34" cy="34" r={radius}
              fill="none"
              stroke={netPct > 15 ? 'hsl(142 71% 45%)' : netPct > 5 ? 'hsl(45 93% 47%)' : 'hsl(0 72% 51%)'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform="rotate(-90 34 34)"
              style={{ transition: 'stroke-dasharray 1.2s ease' }}
            />
            <text x="34" y="39" textAnchor="middle" className="text-[9px]" fill="hsl(210 40% 96%)" fontWeight="700" fontSize="11">
              {netPct.toFixed(0)}%
            </text>
          </svg>
        </div>
      </div>

      {/* COGS % — hidden on mobile */}
      <div className="card-glass p-5 animate-fade-up-4 hidden sm:block">
        <div className="flex items-start justify-between mb-1">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <TrendBadge value={advancedStats.cogsPercentChange} inverted />
        </div>
        <div className="mt-3 text-3xl font-black tabular-nums text-foreground">
          {advancedStats.cogsPercent.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground mt-1">COGS %</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white/[0.03] rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground">Receita</div>
            <div className="text-sm font-bold text-foreground mt-0.5">
              €{stats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground">Custos</div>
            <div className="text-sm font-bold text-foreground mt-0.5">
              €{stats.costs.toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
