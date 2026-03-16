'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChannelSplitChartProps {
  stats: {
    revenue: number;
    dineInRevenue?: number;
    takeawayRevenue?: number;
  };
}

const COLORS = ['hsl(258 90% 66%)', 'hsl(240 84% 67%)'];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl bg-card border border-white/10 shadow-modal text-xs">
      <span className="font-semibold text-foreground">{payload[0].name}: </span>
      <span className="text-muted-foreground">€{Number(payload[0].value).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</span>
    </div>
  );
};

export default function ChannelSplitChart({ stats }: ChannelSplitChartProps) {
  const dineIn = stats.dineInRevenue ?? 0;
  const takeaway = stats.takeawayRevenue ?? 0;
  const total = dineIn + takeaway;

  const data = [
    { name: 'Local', value: dineIn },
    { name: 'Take-away', value: takeaway },
  ].filter(d => d.value > 0);

  if (!total) {
    return (
      <div className="card-glass p-6">
        <h3 className="font-bold text-foreground mb-4">Canal de Vendas</h3>
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Sem dados de receita.
        </div>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-4">Canal de Vendas</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(v) => <span style={{ color: 'hsl(215 20% 55%)' }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
