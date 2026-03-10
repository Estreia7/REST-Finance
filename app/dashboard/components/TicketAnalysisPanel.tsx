'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getTicketAnalysis } from '../actions';

interface TicketData {
  daily: Array<{
    date: Date;
    avgTicket: number;
    dineInAvg: number;
    takeawayAvg: number;
    dineInTickets: number;
    takeawayTickets: number;
  }>;
  avgTicket: number;
  avgDineIn: number;
  avgTakeaway: number;
  totalTickets: number;
}

export default function TicketAnalysisPanel() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
  const [data, setData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    getTicketAnalysis(new Date(dateFrom), new Date(dateTo + 'T23:59:59')).then(r => {
      if (r.success && r.data) setData(r.data as TicketData);
      setLoading(false);
    });
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const fmt = (n: number) => `€${n.toFixed(2)}`;

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!data || data.daily.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Sem dados de tickets para este período.</div>;
  }

  const chartData = data.daily.map(d => ({
    date: new Date(d.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
    local: Number(d.dineInAvg.toFixed(2)),
    takeaway: Number(d.takeawayAvg.toFixed(2)),
    medio: Number(d.avgTicket.toFixed(2)),
  }));

  return (
    <div className="space-y-4">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field !py-1.5 !text-xs w-[130px]" />
        <span className="text-muted-foreground text-xs">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field !py-1.5 !text-xs w-[130px]" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Ticket Médio</div>
          <div className="text-xl font-bold gradient-text">{fmt(data.avgTicket)}</div>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Médio Local</div>
          <div className="text-xl font-bold text-foreground">{fmt(data.avgDineIn)}</div>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Médio Takeaway</div>
          <div className="text-xl font-bold text-foreground">{fmt(data.avgTakeaway)}</div>
        </div>
        <div className="card-glass p-4 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Tickets</div>
          <div className="text-xl font-bold text-foreground">{data.totalTickets}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-bold text-foreground mb-6">Evolução do Ticket Médio</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'hsl(215 20% 65%)', fontSize: 11 }} tickFormatter={v => `€${v}`} />
              <Tooltip
                contentStyle={{ background: 'hsl(222 47% 11%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                formatter={(value: number) => [`€${value.toFixed(2)}`]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="medio" name="Médio" stroke="hsl(258 90% 66%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="local" name="Local" stroke="hsl(142 71% 45%)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="takeaway" name="Takeaway" stroke="hsl(45 93% 47%)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
