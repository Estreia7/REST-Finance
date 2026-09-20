import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMember, isAuthError } from '@/lib/auth-helpers';
import { calculateKpis, toPercent } from '@/lib/kpi';
import ReactPDF from '@react-pdf/renderer';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import React from 'react';
import { toClientError } from '@/lib/errors';

// Authenticated + cookie-based: never statically rendered.
export const dynamic = 'force-dynamic';

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

  // The header becomes a row once there is a logo to sit beside the title.
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 20 },
  logo: { width: 48, height: 48, objectFit: 'contain' as const },

  // A quantity column, for the revenue categories: how many went out matters
  // as much as what they were worth.
  qty: { width: 54, textAlign: 'right' as const, color: '#888' },

  chartBlock: { marginTop: 14 },
  chartTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 6 },
  chartRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 3 },
  chartLabel: { width: 110, fontSize: 8, color: '#444' },
  chartTrack: { flex: 1, height: 9, backgroundColor: '#f0f0f4', borderRadius: 2 },
  chartBar: { height: 9, borderRadius: 2 },
  chartPct: { width: 40, fontSize: 8, textAlign: 'right' as const, fontWeight: 'bold' },
  chartValue: { width: 72, fontSize: 8, textAlign: 'right' as const, color: '#666' },
});

const fmt = (n: number) => `€${n.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * Colours for the share bars.
 *
 * Chosen to stay distinguishable in greyscale, because a monthly report gets
 * printed and handed to an accountant far more often than it gets read on a
 * screen: the sequence alternates light and dark rather than running through
 * a hue wheel at one lightness.
 */
const BAND_COLOURS = [
  '#1a1a2e', '#c2703d', '#6b7280', '#e0a458',
  '#4b5563', '#a8674a', '#9ca3af', '#d4b483',
];

/**
 * The restaurant's logo, as bytes the PDF can embed.
 *
 * Read from disk rather than fetched over HTTP: this runs on the server that
 * holds the file, and a request back into our own app would need a session
 * the renderer does not have. Returns null on anything at all — a missing or
 * unreadable logo must never be the reason a report fails to generate.
 */
async function readLogo(logoPath: string | null): Promise<Buffer | null> {
  if (!logoPath) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const { resolveStoredPath } = await import('@/lib/uploads');
    const absolute = resolveStoredPath(logoPath);
    if (!absolute) return null;
    return await readFile(absolute);
  } catch {
    return null;
  }
}

/**
 * A share-of-total bar chart.
 *
 * Drawn from plain views rather than an image: @react-pdf has no chart
 * primitive, and a rasterised chart would blur when the report is printed,
 * which is most of the time. Horizontal bars because the labels are category
 * names — "PRODUTOS MAIN MENU" does not fit under a vertical column.
 */
function ShareChart({ title, rows, total }: {
  title: string;
  rows: Array<{ name: string; total: number }>;
  total: number;
}) {
  if (rows.length === 0 || total <= 0) return null;

  // Beyond eight bands the chart stops being readable and the tail is noise;
  // what is left is grouped so the percentages still add to a hundred.
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8);
  const bands = rest.length
    ? [...shown, { name: `Outras (${rest.length})`, total: rest.reduce((s, r) => s + r.total, 0) }]
    : shown;

  return React.createElement(View, { style: styles.chartBlock, wrap: false },
    React.createElement(Text, { style: styles.chartTitle }, title),
    ...bands.map((band, i) => {
      const share = (band.total / total) * 100;
      return React.createElement(View, { key: `band-${i}`, style: styles.chartRow },
        React.createElement(Text, { style: styles.chartLabel }, band.name),
        React.createElement(View, { style: styles.chartTrack },
          React.createElement(View, {
            style: {
              ...styles.chartBar,
              // Floored so a category worth a fraction of a percent still
              // shows as a mark rather than vanishing.
              width: `${Math.max(share, 0.6)}%`,
              backgroundColor: BAND_COLOURS[i % BAND_COLOURS.length],
            },
          }),
        ),
        React.createElement(Text, { style: styles.chartPct }, `${share.toFixed(1)}%`),
        React.createElement(Text, { style: styles.chartValue }, fmt(band.total)),
      );
    }),
  );
}

function MonthlyReport({ data }: { data: any }) {
  const { restaurant, month, year, revenue, costs, pnl, kpis, logo } = data;
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: styles.page },
      // Header. The logo sits beside the name when there is one, so a
      // restaurant that has not uploaded one gets the old layout rather than
      // a gap where a picture should be.
      React.createElement(View, { style: logo ? styles.headerRow : styles.header },
        ...(logo ? [React.createElement(Image, { key: 'logo', src: logo, style: styles.logo })] : []),
        React.createElement(View, { key: 'titles' },
          React.createElement(Text, { style: styles.title }, `${restaurant} — Relatório Mensal`),
          React.createElement(Text, { style: styles.subtitle }, `${monthNames[month - 1]} ${year}`),
        ),
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
      // What was sold, indented under Local. Present only where the till has
      // told us; a restaurant entering totals by hand sees the report exactly
      // as it was.
      ...(revenue.byCategory || []).map((c: any, i: number) =>
        React.createElement(View, { key: `rev-${i}`, style: { ...styles.row, paddingLeft: 14 } },
          React.createElement(Text, { style: { ...styles.label, color: '#666', fontSize: 9 } }, c.name),
          React.createElement(Text, { style: styles.qty }, c.quantity > 0 ? `${c.quantity} un` : ''),
          React.createElement(Text, { style: { ...styles.value, fontWeight: 'normal', fontSize: 9, color: '#666' } }, fmt(c.total)),
        )
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
      // Where it came from and where it went, as shares. Figures above
      // answer "how much"; these answer "what mattered", which is the
      // question an owner actually brings to a monthly report.
      React.createElement(Text, { style: styles.sectionTitle }, 'Peso de cada categoria'),
      React.createElement(ShareChart, {
        title: 'Receita por categoria',
        rows: revenue.byCategory || [],
        total: (revenue.byCategory || []).reduce((s: number, c: any) => s + c.total, 0),
      }),
      React.createElement(ShareChart, {
        title: 'Despesas operacionais',
        rows: costs.opexByCategory || [],
        total: pnl.totalOPEX,
      }),

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
    // requireMember enforces an ACTIVE OWNER/STAFF membership. The previous
    // inline lookup filtered on userId alone, so a deactivated staff member
    // kept full PDF access to the monthly P&L.
    const member = await requireMember();
    if (isAuthError(member)) {
      return NextResponse.json({ error: member.error }, { status: member.requiresAuth ? 401 : 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month') || `${new Date().getMonth() + 1}`);
    const year = parseInt(searchParams.get('year') || `${new Date().getFullYear()}`);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
    }

    // The restaurant always comes from the caller's own membership; a
    // client-supplied restaurantId is never trusted.
    const rid = member.restaurantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: rid },
      select: { name: true, logoPath: true },
    });
    if (!restaurant) return NextResponse.json({ error: 'No restaurant' }, { status: 404 });

    const rName = restaurant.name;
    const logo = await readLogo(restaurant.logoPath);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Revenue
    const revenues = await prisma.dailySummary.findMany({
      where: { restaurantId: rid, deletedAt: null, date: { gte: startDate, lte: endDate } },
    });

    // What was actually sold, where the POS import has supplied it. A
    // restaurant entering totals by hand has none of this, and the section
    // is simply absent from their report rather than showing an empty table.
    const categoryRevenue = await prisma.dailyCategoryRevenue.findMany({
      where: { restaurantId: rid, date: { gte: startDate, lte: endDate } },
      select: { revenue: true, quantity: true, category: { select: { name: true } } },
    });

    const revenueByCategory = (() => {
      const byName = new Map<string, { name: string; total: number; quantity: number }>();
      for (const row of categoryRevenue) {
        const name = row.category?.name ?? 'Sem categoria';
        const acc = byName.get(name) ?? { name, total: 0, quantity: 0 };
        acc.total += row.revenue.toNumber();
        acc.quantity += row.quantity;
        byName.set(name, acc);
      }
      // Categories that sold nothing — the till's modifiers and staff meals —
      // would be rows of zero in a report read to see where money came from.
      return [...byName.values()]
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total);
    })();
    const dineIn = revenues.reduce((s, r) => s + r.dineInRevenue.toNumber(), 0);
    const takeaway = revenues.reduce((s, r) => s + r.takeawayRevenue.toNumber(), 0);
    const totalRevenue = dineIn + takeaway;
    const dineInTickets = revenues.reduce((s, r) => s + r.dineInTickets, 0);
    const takeawayTickets = revenues.reduce((s, r) => s + r.takeawayTickets, 0);
    const totalTickets = dineInTickets + takeawayTickets;

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

    // Labour is the subset of OPEX in categories flagged as labour. Prime Cost
    // was previously computed as (COGS + ALL opex), which swept in rent and
    // utilities and overstated it — while the dashboard, matching labour by
    // hardcoded names, understated it. The two reports disagreed.
    const labourTotal = opexList
      .filter(c => c.category?.isLabour)
      .reduce((s, c) => s + c.amount.toNumber(), 0);
    const nonLabourOpex = totalOPEX - labourTotal;

    // All financial formulas come from lib/kpi.ts — the single source of truth.
    const kpis = calculateKpis({
      revenueTotal: totalRevenue,
      cogsTotal: totalCOGS,
      labourTotal,
      opexTotal: nonLabourOpex,
      dineInRevenue: dineIn,
      takeawayRevenue: takeaway,
      dineInTickets,
      takeawayTickets,
    });

    const data = {
      restaurant: rName,
      month,
      year,
      logo,
      revenue: { dineIn, takeaway, byCategory: revenueByCategory },
      costs: { cogsByCategory: groupByCategory(cogsList), opexByCategory: groupByCategory(opexList) },
      pnl: {
        totalRevenue,
        totalCOGS,
        grossProfit: kpis.grossProfit,
        totalOPEX,
        netIncome: kpis.netIncome,
      },
      kpis: {
        grossMargin: toPercent(kpis.grossProfitPct),
        netMargin: toPercent(kpis.netIncomePct),
        avgTicket: kpis.avgTicketOverall,
        primeCost: toPercent(kpis.primeCostPct),
      },
    };

    // Log export
    await prisma.exportLog.create({
      data: { restaurantId: rid, userId: member.userId, type: 'PDF', resource: `monthly-report-${year}-${month}` },
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
  } catch (err: unknown) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: toClientError('Failed to generate PDF', err, 'generic') }, { status: 500 });
  }
}
