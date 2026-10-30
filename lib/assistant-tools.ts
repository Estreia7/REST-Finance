import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { dayKey } from '@/lib/ai-usage';
import { dueDateFor, paymentState, toDayKey } from '@/lib/payments';

/**
 * What the assistant can look up, and how.
 *
 * Every tool is read-only and takes the restaurant from the caller, never
 * from the model: the model chooses dates and search words, nothing else. No
 * tool writes, and none runs SQL the model wrote. Answers are small JSON
 * objects, rounded to the cent, so the model quotes figures instead of
 * inventing them.
 */

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MAX_DAYS = 800;

const range = {
  from: { type: 'string', description: 'First day, inclusive, as YYYY-MM-DD.' },
  to: { type: 'string', description: 'Last day, inclusive, as YYYY-MM-DD.' },
} as const;

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'period_summary',
    description:
      'Takings, costs and result for a period: revenue, total costs, food and drink (COGS), staff, occupancy, other costs, result and margin. Use for "how did I do", "how much did I make", food cost or staff cost questions.',
    input_schema: { type: 'object', properties: { ...range }, required: ['from', 'to'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'costs_by_category',
    description: 'Costs in a period split by the restaurant\'s own categories, largest first.',
    input_schema: { type: 'object', properties: { ...range }, required: ['from', 'to'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'supplier_spend',
    description:
      'What was bought from each supplier in a period, with the number of invoices and what is still unpaid. Optionally only suppliers whose name contains a word.',
    input_schema: {
      type: 'object',
      properties: { ...range, supplier: { type: ['string', 'null'], description: 'Part of a supplier name, or null for all.' } },
      required: ['from', 'to', 'supplier'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'item_purchases',
    description:
      'Invoice lines for a product in a period (e.g. "azeite", "bacalhau"): quantity, unit, total spent, average and latest unit price, by supplier. Use for "how much X did I buy" and "what do I pay for X".',
    input_schema: {
      type: 'object',
      properties: { ...range, product: { type: 'string', description: 'A word from the product name.' } },
      required: ['from', 'to', 'product'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'price_changes',
    description:
      'Products whose unit price went up (or down) between their last two purchases within the last N days, biggest rise first.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How far back to look, 7 to 365.' } },
      required: ['days'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'payables',
    description: 'What is owed to suppliers right now: total unpaid, total overdue, and the suppliers owed most.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'daily_revenue',
    description: 'Takings per day in a period (at most 62 days), with dine-in and takeaway, and the weekday.',
    input_schema: { type: 'object', properties: { ...range }, required: ['from', 'to'], additionalProperties: false },
    strict: true,
  },
];

class ToolInputError extends Error {}

function dates(input: Record<string, unknown>, maxDays = MAX_DAYS): { from: Date; to: Date } {
  const ok = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!ok(input.from) || !ok(input.to)) throw new ToolInputError('from and to must be YYYY-MM-DD');
  const from = new Date(`${input.from}T00:00:00Z`);
  const to = new Date(`${input.to}T23:59:59Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new ToolInputError('invalid range');
  if ((to.getTime() - from.getTime()) / 86_400_000 > maxDays) throw new ToolInputError(`range longer than ${maxDays} days`);
  return { from, to };
}

function words(text: unknown): string {
  return typeof text === 'string'
    ? text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().slice(0, 60)
    : '';
}

/** Runs one tool for one restaurant. Returns JSON text, or throws ToolInputError for bad arguments. */
export async function runAssistantTool(name: string, input: Record<string, unknown>, restaurantId: string): Promise<string> {
  switch (name) {
    case 'period_summary': {
      const { from, to } = dates(input);
      const [revenue, costs] = await Promise.all([
        prisma.dailySummary.aggregate({
          where: { restaurantId, deletedAt: null, date: { gte: from, lte: to } },
          _sum: { revenueTotal: true },
          _count: { _all: true },
        }),
        prisma.costEntry.findMany({
          where: { restaurantId, deletedAt: null, date: { gte: from, lte: to } },
          select: { amount: true, type: true, category: { select: { isLabour: true, isOccupancy: true } } },
        }),
      ]);
      const rev = Number(revenue._sum.revenueTotal ?? 0);
      let cogs = 0, staff = 0, occupancy = 0, other = 0;
      for (const c of costs) {
        const a = Number(c.amount);
        if (c.type === 'COGS') cogs += a;
        else if (c.category?.isLabour) staff += a;
        else if (c.category?.isOccupancy) occupancy += a;
        else other += a;
      }
      const total = cogs + staff + occupancy + other;
      const pct = (n: number) => (rev > 0 ? Math.round((n / rev) * 1000) / 10 : null);
      return JSON.stringify({
        revenue: cents(rev), daysWithTakings: revenue._count._all,
        costs: cents(total), foodAndDrink: cents(cogs), staff: cents(staff), occupancy: cents(occupancy), otherCosts: cents(other),
        result: cents(rev - total), marginPct: pct(rev - total), foodCostPct: pct(cogs), staffCostPct: pct(staff),
        note: 'Revenue includes VAT as typed or imported from the till; costs are as booked.',
      });
    }

    case 'costs_by_category': {
      const { from, to } = dates(input);
      const rows = await prisma.costEntry.groupBy({
        by: ['categoryId'],
        where: { restaurantId, deletedAt: null, date: { gte: from, lte: to } },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const cats = await prisma.category.findMany({
        where: { id: { in: rows.map((r) => r.categoryId).filter((x): x is string => !!x) } },
        select: { id: true, name: true, type: true },
      });
      const byId = new Map(cats.map((c) => [c.id, c]));
      return JSON.stringify(
        rows
          .map((r) => ({
            category: r.categoryId ? byId.get(r.categoryId)?.name ?? '?' : '(no category)',
            type: r.categoryId ? byId.get(r.categoryId)?.type ?? null : null,
            total: cents(Number(r._sum.amount ?? 0)),
            entries: r._count._all,
          }))
          .sort((a, b) => b.total - a.total),
      );
    }

    case 'supplier_spend': {
      const { from, to } = dates(input);
      const term = words(input.supplier);
      const costs = await prisma.costEntry.findMany({
        where: { restaurantId, deletedAt: null, splitFromId: null, vendorId: { not: null }, date: { gte: from, lte: to } },
        select: {
          amount: true, paidAt: true, paymentMethod: true,
          vendor: { select: { name: true } },
          splitParts: { where: { deletedAt: null }, select: { amount: true } },
        },
      });
      const by = new Map<string, { supplier: string; total: number; invoices: number; unpaid: number }>();
      for (const c of costs) {
        const name = c.vendor!.name;
        if (term && !words(name).includes(term)) continue;
        const amount = Number(c.amount) + c.splitParts.reduce((s, p) => s + Number(p.amount), 0);
        const row = by.get(name) ?? { supplier: name, total: 0, invoices: 0, unpaid: 0 };
        row.total += amount;
        row.invoices++;
        if (!c.paidAt && c.paymentMethod !== 'DIRECT_DEBIT') row.unpaid += amount;
        by.set(name, row);
      }
      return JSON.stringify(
        [...by.values()]
          .map((r) => ({ ...r, total: cents(r.total), unpaid: cents(r.unpaid) }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 40),
      );
    }

    case 'item_purchases': {
      const { from, to } = dates(input);
      const term = words(input.product);
      if (term.length < 2) throw new ToolInputError('product must have at least 2 letters');
      const lines = await prisma.invoiceItem.findMany({
        where: {
          restaurantId,
          invoiceDate: { gte: from, lte: to },
          AND: [
            // As typed ("açúcar") or without accents ("acucar"): names keep theirs.
            { OR: [
              { productName: { contains: String(input.product).trim().slice(0, 60), mode: 'insensitive' } },
              { normalizedName: { contains: term } },
            ] },
            { OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] },
          ],
        },
        orderBy: { invoiceDate: 'asc' },
        take: 500,
        select: { productName: true, quantity: true, unit: true, unitPrice: true, totalPrice: true, invoiceDate: true, vendor: { select: { name: true } } },
      });
      const by = new Map<string, { product: string; supplier: string | null; unit: string | null; quantity: number; total: number; purchases: number; latestUnitPrice: number; latestDate: string }>();
      for (const l of lines) {
        const key = `${l.productName}|${l.vendor?.name ?? ''}|${l.unit ?? ''}`;
        const row = by.get(key) ?? { product: l.productName, supplier: l.vendor?.name ?? null, unit: l.unit, quantity: 0, total: 0, purchases: 0, latestUnitPrice: 0, latestDate: '' };
        row.quantity += Number(l.quantity);
        row.total += Number(l.totalPrice);
        row.purchases++;
        row.latestUnitPrice = Number(l.unitPrice);
        row.latestDate = l.invoiceDate ? toDayKey(l.invoiceDate) : row.latestDate;
        by.set(key, row);
      }
      const rows = [...by.values()].map((r) => ({
        ...r,
        quantity: Math.round(r.quantity * 1000) / 1000,
        total: cents(r.total),
        averageUnitPrice: r.quantity > 0 ? Math.round((r.total / r.quantity) * 10000) / 10000 : null,
      }));
      return JSON.stringify({ matches: rows.sort((a, b) => b.total - a.total).slice(0, 30), linesFound: lines.length });
    }

    case 'price_changes': {
      const days = Math.min(365, Math.max(7, Number(input.days) || 90));
      const since = new Date(Date.now() - days * 86_400_000);
      const lines = await prisma.invoiceItem.findMany({
        where: { restaurantId, invoiceDate: { gte: since }, OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] },
        orderBy: { invoiceDate: 'asc' },
        take: 5000,
        select: { productName: true, normalizedName: true, unit: true, unitPrice: true, invoiceDate: true, vendor: { select: { name: true } } },
      });
      const last = new Map<string, Array<{ price: number; date: string; product: string; supplier: string | null; unit: string | null }>>();
      for (const l of lines) {
        const key = `${l.normalizedName}|${l.vendor?.name ?? ''}|${l.unit ?? ''}`;
        const list = last.get(key) ?? [];
        list.push({ price: Number(l.unitPrice), date: l.invoiceDate ? toDayKey(l.invoiceDate) : '', product: l.productName, supplier: l.vendor?.name ?? null, unit: l.unit });
        last.set(key, list.slice(-2));
      }
      const changes = [...last.values()]
        .filter((l) => l.length === 2 && l[0].price > 0 && l[0].price !== l[1].price)
        .map(([a, b]) => ({
          product: b.product, supplier: b.supplier, unit: b.unit,
          before: a.price, beforeDate: a.date, now: b.price, nowDate: b.date,
          changePct: Math.round(((b.price - a.price) / a.price) * 1000) / 10,
        }))
        .sort((x, y) => y.changePct - x.changePct);
      return JSON.stringify({ rises: changes.filter((c) => c.changePct > 0).slice(0, 15), falls: changes.filter((c) => c.changePct < 0).slice(-5) });
    }

    case 'payables': {
      const todayKey = dayKey(new Date());
      const open = await prisma.costEntry.findMany({
        where: { restaurantId, deletedAt: null, splitFromId: null, paidAt: null },
        select: {
          date: true, amount: true, dueDate: true, paymentMethod: true,
          vendor: { select: { name: true, paymentTermsDays: true } },
          splitParts: { where: { deletedAt: null }, select: { amount: true } },
        },
      });
      let unpaid = 0, overdue = 0;
      const owed = new Map<string, number>();
      for (const e of open) {
        const dueKey = dueDateFor({ dateKey: toDayKey(e.date), dueKey: e.dueDate ? toDayKey(e.dueDate) : null, hasVendor: !!e.vendor, termsDays: e.vendor?.paymentTermsDays });
        const state = paymentState({ paidKey: null, method: e.paymentMethod, dueKey }, todayKey);
        if (state === 'paid' || state === 'scheduled') continue;
        const amount = Number(e.amount) + e.splitParts.reduce((s, p) => s + Number(p.amount), 0);
        unpaid += amount;
        if (state === 'overdue') overdue += amount;
        const who = e.vendor?.name ?? '(no supplier)';
        owed.set(who, (owed.get(who) ?? 0) + amount);
      }
      return JSON.stringify({
        today: todayKey, unpaid: cents(unpaid), overdue: cents(overdue),
        mostOwed: [...owed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([supplier, total]) => ({ supplier, total: cents(total) })),
      });
    }

    case 'daily_revenue': {
      const { from, to } = dates(input, 62);
      const rows = await prisma.dailySummary.findMany({
        where: { restaurantId, deletedAt: null, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
        select: { date: true, revenueTotal: true, dineInRevenue: true, takeawayRevenue: true },
      });
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return JSON.stringify(rows.map((r) => ({
        date: toDayKey(r.date), weekday: weekday[r.date.getUTCDay()],
        total: cents(Number(r.revenueTotal)), dineIn: cents(Number(r.dineInRevenue)), takeaway: cents(Number(r.takeawayRevenue)),
      })));
    }

    default:
      throw new ToolInputError(`unknown tool ${name}`);
  }
}

export { ToolInputError };
