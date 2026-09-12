'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';

interface MonthlyItem {
  month: string;
  dineIn: number;
  takeaway: number;
  total: number;
}

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

export default function RevenueChart({ data }: { data: MonthlyItem[] }) {
  const chart = useChartTheme();
  // Series colours come from the theme, so they cannot live at module scope.
  const COLORS = [chart.primary, chart.info];
  const { t } = useLanguage();
  if (!data.length) {
    return (
      <div className="card-glass p-6">
        <h3 className="font-bold text-foreground mb-6">{t('charts.titleMonthlyRevenue')}</h3>
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          Sem dados suficientes para mostrar o gráfico.
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-6">{t('charts.titleRevenueByChannel')}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
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
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} />
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
