import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import ReactPDF from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a2e' },
  header: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666' },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 18, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', paddingBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowAlt: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, backgroundColor: '#f8f8fc' },
  label: { flex: 1 },
  value: { fontWeight: 'bold', textAlign: 'right' as const, width: 100 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 2, borderTopColor: '#1a1a2e', marginTop: 4 },
  totalLabel: { fontSize: 12, fontWeight: 'bold' },
  totalValue: { fontSize: 12, fontWeight: 'bold', textAlign: 'right' as const, width: 100 },
  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  kpiCard: { flex: 1, padding: 10, backgroundColor: '#f4f4f8', borderRadius: 6 },
  kpiLabel: { fontSize: 8, color: '#888', marginBottom: 2 },
  kpiValue: { fontSize: 14, fontWeight: 'bold' },
  disclaimer: { marginTop: 30, padding: 10, backgroundColor: '#fff8e1', borderRadius: 4, fontSize: 8, color: '#996600' },
  footer: { position: 'absolute' as const, bottom: 30, left: 40, right: 40, fontSize: 8, color: '#aaa', textAlign: 'center' as const },
});

const fmt = (n: number) => `€${n.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

function MonthlyReport({ data }: { data: any }) {
  const { restaurant, month, year, revenue, costs, pnl, kpis } = data;
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: styles.page },
      // Header
      React.createElement(View, { style: styles.header },
        React.createElement(Text, { style: styles.title }, `${restaurant} — Relatório Mensal`),
        React.createElement(Text, { style: styles.subtitle }, `${monthNames[month - 1]} ${year}`),
      ),
      // KPIs
      React.createElement(View, { style: styles.kpiGrid },
        React.createElement(View, { style: styles.kpiCard },
          React.createElement(Text, { style: styles.kpiLabel }, 'Receita Total'),
          React.createElement(Text, { style: styles.kpiValue }, fmt(pnl.totalRevenue)),
        ),
        React.createElement(View, { style: styles.kpiCard },
          React.createElement(Text, { style: styles.kpiLabel }, 'Lucro Líquido'),
          React.createElement(Text, { style: styles.kpiValue }, fmt(pnl.netIncome)),
        ),
        React.createElement(View, { style: styles.kpiCard },
          React.createElement(Text, { style: styles.kpiLabel }, 'Margem Líquida'),
          React.createElement(Text, { style: styles.kpiValue }, pct(kpis.netMargin)),
        ),
        React.createElement(View, { style: styles.kpiCard },
          React.createElement(Text, { style: styles.kpiLabel }, 'Ticket Médio'),
          React.createElement(Text, { style: styles.kpiValue }, fmt(kpis.avgTicket)),
        ),
      ),
      // Revenue section
      React.createElement(Text, { style: styles.sectionTitle }, 'Receita'),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Receita Local'),
        React.createElement(Text, { style: styles.value }, fmt(revenue.dineIn)),
      ),
      React.createElement(View, { style: styles.rowAlt },
        React.createElement(Text, { style: styles.label }, 'Receita Takeaway'),
        React.createElement(Text, { style: styles.value }, fmt(revenue.takeaway)),
      ),
      React.createElement(View, { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, 'Total Receita'),
        React.createElement(Text, { style: styles.totalValue }, fmt(pnl.totalRevenue)),
      ),
      // COGS section
      React.createElement(Text, { style: styles.sectionTitle }, 'Custos das Mercadorias (COGS)'),
      ...(costs.cogsByCategory || []).map((c: any, i: number) =>
        React.createElement(View, { key: `cogs-${i}`, style: i % 2 === 0 ? styles.row : styles.rowAlt },
          React.createElement(Text, { style: styles.label }, c.name),
          React.createElement(Text, { style: styles.value }, fmt(c.total)),
        )
      ),
      React.createElement(View, { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, 'Total COGS'),
        React.createElement(Text, { style: styles.totalValue }, fmt(pnl.totalCOGS)),
      ),
      // Gross profit
      React.createElement(View, { style: { ...styles.row, marginTop: 4, marginBottom: 4 } },
        React.createElement(Text, { style: { ...styles.label, fontWeight: 'bold', fontSize: 11 } }, `Lucro Bruto (${pct(kpis.grossMargin)})`),
        React.createElement(Text, { style: { ...styles.value, fontWeight: 'bold', fontSize: 11 } }, fmt(pnl.grossProfit)),
      ),
      // OPEX section
      React.createElement(Text, { style: styles.sectionTitle }, 'Despesas Operacionais (OPEX)'),
      ...(costs.opexByCategory || []).map((c: any, i: number) =>
        React.createElement(View, { key: `opex-${i}`, style: i % 2 === 0 ? styles.row : styles.rowAlt },
          React.createElement(Text, { style: styles.label }, c.name),
          React.createElement(Text, { style: styles.value }, fmt(c.total)),
        )
      ),
      React.createElement(View, { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, 'Total OPEX'),
        React.createElement(Text, { style: styles.totalValue }, fmt(pnl.totalOPEX)),
      ),
      // Net income
      React.createElement(View, { style: { ...styles.totalRow, marginTop: 8 } },
        React.createElement(Text, { style: { ...styles.totalLabel, fontSize: 14 } }, 'Lucro Líquido'),
        React.createElement(Text, { style: { ...styles.totalValue, fontSize: 14, color: pnl.netIncome >= 0 ? '#16a34a' : '#dc2626' } }, fmt(pnl.netIncome)),
      ),
      // Disclaimer
      React.createElement(View, { style: styles.disclaimer },
        React.createElement(Text, {}, 'Este relatório é mais preciso quando todas as entradas diárias do mês foram registadas. Verifique se todos os dados estão completos antes de tomar decisões com base neste documento.'),
      ),
      // Footer
      React.createElement(Text, { style: styles.footer }, `REST Finance — Gerado em ${new Date().toLocaleDateString('pt-PT')}`),
    )
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month') || `${new Date().getMonth() + 1}`);
    const year = parseInt(searchParams.get('year') || `${new Date().getFullYear()}`);
    const restaurantId = searchParams.get('restaurantId');

    // Find restaurant
    const membership = await prisma.membership.findFirst({
      where: restaurantId ? { userId: user.id, restaurantId } : { userId: user.id },
      include: { restaurant: true },
    });
    if (!membership) return NextResponse.json({ error: 'No restaurant' }, { status: 404 });

    const rid = membership.restaurantId;
    const rName = membership.restaurant.name;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Revenue
    const revenues = await prisma.dailySummary.findMany({
      where: { restaurantId: rid, deletedAt: null, date: { gte: startDate, lte: endDate } },
    });
    const dineIn = revenues.reduce((s, r) => s + r.dineInRevenue.toNumber(), 0);
    const takeaway = revenues.reduce((s, r) => s + r.takeawayRevenue.toNumber(), 0);
    const totalRevenue = dineIn + takeaway;
    const totalTickets = revenues.reduce((s, r) => s + r.dineInTickets + r.takeawayTickets, 0);

    // Costs
    const costEntries = await prisma.costEntry.findMany({
      where: { restaurantId: rid, deletedAt: null, date: { gte: startDate, lte: endDate } },
      include: { category: true },
    });

    const cogsList = costEntries.filter(c => c.type === 'COGS');
    const opexList = costEntries.filter(c => c.type === 'OPEX');

    const groupByCategory = (entries: typeof costEntries) => {
      const map = new Map<string, number>();
      entries.forEach(e => {
        const name = e.category?.name || 'Sem categoria';
        map.set(name, (map.get(name) || 0) + e.amount.toNumber());
      });
      return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    };

    const totalCOGS = cogsList.reduce((s, c) => s + c.amount.toNumber(), 0);
    const totalOPEX = opexList.reduce((s, c) => s + c.amount.toNumber(), 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netIncome = grossProfit - totalOPEX;

    const data = {
      restaurant: rName,
      month,
      year,
      revenue: { dineIn, takeaway },
      costs: { cogsByCategory: groupByCategory(cogsList), opexByCategory: groupByCategory(opexList) },
      pnl: { totalRevenue, totalCOGS, grossProfit, totalOPEX, netIncome },
      kpis: {
        grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
        netMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
        avgTicket: totalTickets > 0 ? totalRevenue / totalTickets : 0,
        primeCost: totalRevenue > 0 ? ((totalCOGS + totalOPEX) / totalRevenue) * 100 : 0,
      },
    };

    // Log export
    await prisma.exportLog.create({
      data: { restaurantId: rid, userId: user.id, type: 'PDF', resource: `monthly-report-${year}-${month}` },
    });

    const pdfStream = await ReactPDF.renderToStream(MonthlyReport({ data }) as any);

    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-${year}-${String(month).padStart(2, '0')}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate PDF' }, { status: 500 });
  }
}
