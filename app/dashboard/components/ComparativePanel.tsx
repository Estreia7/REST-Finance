'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getComparativeData } from '../actions';

interface MonthData {
  label: string;
  revenue: number;
  costs: number;
  profit: number;
}

export default function ComparativePanel() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComparativeData().then(r => {
      if (r.success && r.data) setData(r.data as MonthData[]);
      setLoading(false);
    });
  }, []);

  const fmt = (n: number) => `€${n.toLocaleString('pt-PT', { minimumFractionDigits: 0 })}`;

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  // Trends
  const current = data[data.length - 1];
  const previous = data[data.length - 2];
  const revChange = previous?.revenue ? ((current.revenue - previous.revenue) / previous.revenue * 100) : 0;
  const profitChange = previous?.profit ? ((current.profit - previous.profit) / Math.abs(previous.profit) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Trend cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card-glass p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Receita vs Mês Anterior</div>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-bold ${revChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {revChange >= 0 ? '+' : ''}{revChange.toFixed(1)}%
            </span>
            {revChange >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
        </div>
        <div className="card-glass p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Lucro vs Mês Anterior</div>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-bold ${profitChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {profitChange >= 0 ? '+' : ''}{profitChange.toFixed(1)}%
            </span>
            {profitChange >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
          </div>
        </div>
        <div className="card-glass p-4 col-span-2 md:col-span-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Média Mensal (6m)</div>
          <div className="text-xl font-bold text-foreground">
            {fmt(data.reduce((s, d) => s + d.revenue, 0) / Math.max(data.length, 1))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-bold text-foreground mb-6">Comparação Mensal (6 meses)</h3>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                labelStyle={{ color: 'hsl(210 40% 96%)' }}
                formatter={(value: number) => [fmt(value)]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="revenue" name="Receita" fill="hsl(258 90% 66%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="costs" name="Custos" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Lucro" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly table */}
      <div className="card-glass p-6">
        <h3 className="text-sm font-bold text-foreground mb-4">Detalhe Mensal</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">Mês</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Receita</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Custos</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Lucro</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Margem</th>
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
