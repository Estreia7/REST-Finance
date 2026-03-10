import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'revenue'; // revenue | costs | pnl
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { restaurantId: true },
    });
    if (!membership) return NextResponse.json({ error: 'No restaurant' }, { status: 404 });

    const rid = membership.restaurantId;
    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();

    let csv = '';

    if (type === 'revenue') {
      const entries = await prisma.dailySummary.findMany({
        where: { restaurantId: rid, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      });
      csv = 'Data,Receita Local,Receita Takeaway,Total,Tickets Local,Tickets Takeaway\n';
      entries.forEach(e => {
        const di = e.dineInRevenue.toNumber();
        const ta = e.takeawayRevenue.toNumber();
        csv += `${new Date(e.date).toLocaleDateString('pt-PT')},${di.toFixed(2)},${ta.toFixed(2)},${(di + ta).toFixed(2)},${e.dineInTickets},${e.takeawayTickets}\n`;
      });
    } else if (type === 'costs') {
      const entries = await prisma.costEntry.findMany({
        where: { restaurantId: rid, date: { gte: from, lte: to } },
        include: { category: true },
        orderBy: { date: 'asc' },
      });
      csv = 'Data,Tipo,Categoria,Descrição,Valor\n';
      entries.forEach(e => {
        const desc = (e.description || '').replace(/,/g, ';').replace(/\n/g, ' ');
        csv += `${new Date(e.date).toLocaleDateString('pt-PT')},${e.type},${e.category?.name || ''},${desc},${e.amount.toNumber().toFixed(2)}\n`;
      });
    }

    await prisma.exportLog.create({
      data: { restaurantId: rid, userId: user.id, type: 'CSV', resource: `${type}-export` },
    });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}-export.csv"`,
      },
    });
  } catch (err: any) {
    console.error('CSV export error:', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
