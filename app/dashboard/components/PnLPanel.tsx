'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { getPnLStatement } from '../actions';
import AnnualPnL from './AnnualPnL';
import { formatMoneyExact } from '@/lib/format';

interface PnLData {
  month: number; year: number;
  revenue: number; dineIn: number; takeaway: number;
  cogs: number; opex: number;
  grossProfit: number; grossMargin: number;
  netIncome: number; netMargin: number;
  cogsBreakdown: Array<{ category: string; amount: number }>;
  opexBreakdown: Array<{ category: string; amount: number }>;
}

export default function PnLPanel() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'year'>('month');

  useEffect(() => {
    setLoading(true);
    getPnLStatement(month, year).then(r => {
      if (r.success && r.data) setData(r.data as PnLData);
      setLoading(false);
    });
  }, [month, year]);

  // Shared formatter: the local one set a minimum with no maximum, the same
  // defect that made a figure elsewhere read as millions.
  const fmt = formatMoneyExact;

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  return (
    <div className="space-y-4">
      {/* Monthly statement, or the twelve-month view with percentages. */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted w-fit">
        {([['month', 'Mensal'], ['year', 'Anual']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={view === value}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'year' ? (
        <AnnualPnL />
      ) : (
      <>
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field !py-2 !text-sm w-[160px]">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field !py-2 !text-sm w-[100px]">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sem dados disponíveis.</div>
      ) : (
        <>
          {/* P&L Statement */}
          <div className="card-glass p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">Demonstração de Resultados — {months[month - 1]} {year}</h3>

            <div className="space-y-1">
              {/* Revenue */}
              <div className="flex justify-between py-3 border-b border-border-subtle">
                <span className="font-bold text-foreground">Receita Total</span>
                <span className="font-bold text-foreground">{fmt(data.revenue)}</span>
              </div>
              <div className="flex justify-between py-2 pl-4">
                <span className="text-sm text-muted-foreground">Local</span>
                <span className="text-sm text-muted-foreground">{fmt(data.dineIn)}</span>
              </div>
              <div className="flex justify-between py-2 pl-4 border-b border-border-subtle">
                <span className="text-sm text-muted-foreground">Takeaway</span>
                <span className="text-sm text-muted-foreground">{fmt(data.takeaway)}</span>
              </div>

              {/* COGS */}
              <div className="flex justify-between py-3 border-b border-border-subtle">
                <span className="font-semibold text-foreground">COGS</span>
                <span className="font-semibold text-red-400">-{fmt(data.cogs)}</span>
              </div>
              {data.cogsBreakdown.map((item, i) => (
                <div key={i} className="flex justify-between py-2 pl-4">
                  <span className="text-sm text-muted-foreground">{item.category}</span>
                  <span className="text-sm text-muted-foreground">{fmt(item.amount)}</span>
                </div>
              ))}

              {/* Gross Profit */}
              <div className="flex justify-between py-3 border-y border-border bg-surface -mx-6 px-6">
                <span className="font-bold text-foreground">Lucro Bruto</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${data.grossMargin >= 60 ? 'bg-success/15 text-green-400' : data.grossMargin >= 50 ? 'bg-warning/15 text-amber-400' : 'bg-danger/15 text-red-400'}`}>
                    {data.grossMargin.toFixed(1)}%
                  </span>
                  <span className={`font-bold ${data.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(data.grossProfit)}</span>
                </div>
              </div>

              {/* OPEX */}
              <div className="flex justify-between py-3 border-b border-border-subtle">
                <span className="font-semibold text-foreground">OPEX</span>
                <span className="font-semibold text-red-400">-{fmt(data.opex)}</span>
              </div>
              {data.opexBreakdown.map((item, i) => (
                <div key={i} className="flex justify-between py-2 pl-4">
                  <span className="text-sm text-muted-foreground">{item.category}</span>
                  <span className="text-sm text-muted-foreground">{fmt(item.amount)}</span>
                </div>
              ))}

              {/* Net Income */}
              <div className="flex justify-between py-4 border-t-2 border-border mt-2">
                <span className="text-lg font-black text-foreground">Lucro Líquido</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${data.netMargin >= 15 ? 'bg-success/15 text-green-400' : data.netMargin >= 5 ? 'bg-warning/15 text-amber-400' : 'bg-danger/15 text-red-400'}`}>
                    {data.netMargin.toFixed(1)}%
                  </span>
                  <span className={`text-lg font-black ${data.netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {data.netIncome >= 0 ? '' : '-'}{fmt(Math.abs(data.netIncome))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Receita', value: data.revenue, color: 'text-foreground' },
              { label: 'COGS %', value: data.revenue > 0 ? (data.cogs / data.revenue * 100) : 0, suffix: '%', color: 'text-amber-400' },
              { label: 'OPEX %', value: data.revenue > 0 ? (data.opex / data.revenue * 100) : 0, suffix: '%', color: 'text-info' },
              { label: 'Margem Líq.', value: data.netMargin, suffix: '%', color: data.netMargin >= 15 ? 'text-green-400' : 'text-red-400' },
            ].map((card, i) => (
              <div key={i} className="card-glass p-4 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{card.label}</div>
                <div className={`text-xl font-bold ${card.color}`}>
                  {card.suffix ? `${card.value.toFixed(1)}${card.suffix}` : fmt(card.value)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
