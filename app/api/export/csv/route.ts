import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/** Sanitize a string for safe CSV output (prevent formula injection) */
function sanitizeCsvCell(value: string): string {
  let v = value.replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, '');
  if (/^[=+\-@\t]/.test(v)) {
    v = `'${v}`;
  }
  return v;
}

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
        where: { restaurantId: rid, deletedAt: null, date: { gte: from, lte: to } },
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
        where: { restaurantId: rid, deletedAt: null, date: { gte: from, lte: to } },
        include: { category: true, vendor: true },
        orderBy: { date: 'asc' },
      });
      csv = 'Data,Tipo,Categoria,Fornecedor,Descrição,Valor\n';
      entries.forEach(e => {
        const desc = sanitizeCsvCell(e.description || '');
        const catName = sanitizeCsvCell(e.category?.name || '');
        const vendorName = sanitizeCsvCell(e.vendor?.name || '');
        csv += `${new Date(e.date).toLocaleDateString('pt-PT')},${e.type},${catName},${vendorName},${desc},${e.amount.toNumber().toFixed(2)}\n`;
      });
    } else if (type === 'invoices') {
      const items = await prisma.invoiceItem.findMany({
        where: { restaurantId: rid, invoiceDate: { gte: from, lte: to } },
        include: { vendor: true },
        orderBy: { invoiceDate: 'asc' },
      });
      csv = 'Data,Fornecedor,NIF,Nº Fatura,Produto,Quantidade,Unidade,Preço Unit.,Total\n';
      items.forEach(i => {
        const date = i.invoiceDate ? new Date(i.invoiceDate).toLocaleDateString('pt-PT') : '';
        const vendor = sanitizeCsvCell(i.vendor?.name || '');
        const vendorNif = sanitizeCsvCell(i.vendor?.taxId || '');
        const invNum = sanitizeCsvCell(i.invoiceNumber || '');
        const product = sanitizeCsvCell(i.productName);
        csv += `${date},${vendor},${vendorNif},${invNum},${product},${i.quantity.toNumber()},${i.unit || ''},${i.unitPrice.toNumber().toFixed(4)},${i.totalPrice.toNumber().toFixed(2)}\n`;
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
