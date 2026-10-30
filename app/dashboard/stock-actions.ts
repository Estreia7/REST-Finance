'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { toDayKey } from '@/lib/payments';
import {
  averageUnitCost, suggestItems, essentialItemIds, estimatedOnHand, orderQuantity, usage, lineKey,
  type PurchaseLine, type ItemSuggestion,
} from '@/lib/stock';

/**
 * Stock: items, counts and orders. Owner-only; errors are dictionary keys.
 * Purchases are read from invoice lines, never typed twice.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const DAY = 86_400_000;
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const UUID = /^[0-9a-f-]{36}$/i;

/** Invoice lines since a date, in the shape lib/stock.ts reads. */
async function purchases(restaurantId: string, since: Date): Promise<PurchaseLine[]> {
  const rows = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      OR: [{ invoiceDate: { gte: since } }, { invoiceDate: null, createdAt: { gte: since } }],
      AND: [{ OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] }],
    },
    select: {
      normalizedName: true, productName: true, unit: true, quantity: true, unitPrice: true, totalPrice: true,
      invoiceDate: true, createdAt: true, vendorId: true, vendor: { select: { name: true } },
    },
    take: 20_000,
  });
  return rows.map((r) => ({
    normalizedName: r.normalizedName,
    productName: r.productName,
    unit: r.unit,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unitPrice),
    total: Number(r.totalPrice),
    date: toDayKey(r.invoiceDate ?? r.createdAt),
    vendorId: r.vendorId,
    vendorName: r.vendor?.name ?? null,
  }));
}

export interface StockRow {
  id: string;
  name: string;
  unit: string;
  shelf: string | null;
  vendorId: string | null;
  vendorName: string | null;
  minQuantity: number | null;
  averageCost: number | null;
  lastCount: { quantity: number; date: string } | null;
  onHand: number | null;
  value: number | null;
  toOrder: number;
  essential: boolean;
}

async function loadRows(restaurantId: string): Promise<StockRow[]> {
  const items = await prisma.stockItem.findMany({
    where: { restaurantId, active: true },
    orderBy: [{ shelf: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, normalizedName: true, unit: true, shelf: true, minQuantity: true, vendorId: true,
      vendor: { select: { name: true } },
      countLines: {
        orderBy: { count: { countedAt: 'desc' } },
        take: 1,
        select: { quantity: true, count: { select: { countedAt: true } } },
      },
    },
  });
  if (items.length === 0) return [];

  // Enough history for every item's "since last count", and at least 90 days for prices.
  const oldestCount = items
    .map((i) => i.countLines[0]?.count.countedAt)
    .filter((d): d is Date => !!d)
    .reduce((min, d) => (d < min ? d : min), new Date(Date.now() - 90 * DAY));
  const since = new Date(Math.max(oldestCount.getTime(), Date.now() - 365 * DAY));
  const lines = await purchases(restaurantId, since);
  const byKey = new Map<string, PurchaseLine[]>();
  for (const l of lines) {
    const k = lineKey(l.normalizedName, l.unit);
    byKey.set(k, [...(byKey.get(k) ?? []), l]);
  }

  const recent = Date.now() - 60 * DAY;
  const spend = new Map<string, number>();
  const rows = items.map((i) => {
    const mine = byKey.get(lineKey(i.normalizedName, i.unit || null)) ?? byKey.get(lineKey(i.normalizedName, i.unit)) ?? [];
    spend.set(i.id, mine.filter((l) => Date.parse(l.date) >= recent).reduce((s, l) => s + l.total, 0));
    const priced = mine.filter((l) => Date.parse(l.date) >= Date.now() - 90 * DAY);
    const avg = averageUnitCost(priced.length ? priced : mine);
    const last = i.countLines[0];
    const lastCount = last ? { quantity: Number(last.quantity), date: toDayKey(last.count.countedAt) } : null;
    const boughtSince = last ? mine.filter((l) => l.date > lastCount!.date).reduce((s, l) => s + l.quantity, 0) : 0;
    const onHand = estimatedOnHand(lastCount, boughtSince);
    const min = i.minQuantity === null ? null : Number(i.minQuantity);
    return {
      id: i.id, name: i.name, unit: i.unit, shelf: i.shelf, vendorId: i.vendorId, vendorName: i.vendor?.name ?? null,
      minQuantity: min, averageCost: avg, lastCount, onHand,
      value: onHand !== null && avg !== null ? cents(onHand * avg) : null,
      toOrder: orderQuantity(onHand, min),
      essential: false,
    };
  });
  const essential = essentialItemIds(spend);
  return rows.map((r) => ({ ...r, essential: essential.has(r.id) }));
}

export async function getStockOverview() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const rows = await loadRows(owner.restaurantId);
    const lastCount = await prisma.stockCount.findFirst({
      where: { restaurantId: owner.restaurantId },
      orderBy: { countedAt: 'desc' },
      select: { countedAt: true, kind: true },
    });
    return {
      success: true as const,
      data: {
        rows,
        summary: {
          items: rows.length,
          value: cents(rows.reduce((s, r) => s + (r.value ?? 0), 0)),
          toOrder: rows.filter((r) => r.toOrder > 0).length,
          neverCounted: rows.filter((r) => !r.lastCount).length,
          lastCountAt: lastCount ? toDayKey(lastCount.countedAt) : null,
        },
      },
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read the stock', error, 'read'));
  }
}

/** Products bought in the last four months that are not stock items yet. */
export async function getStockSuggestions() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const [lines, existing] = await Promise.all([
      purchases(owner.restaurantId, new Date(Date.now() - 120 * DAY)),
      prisma.stockItem.findMany({ where: { restaurantId: owner.restaurantId }, select: { normalizedName: true, unit: true } }),
    ]);
    const keys = new Set(existing.map((e) => lineKey(e.normalizedName, e.unit || null)));
    return { success: true as const, data: suggestItems(lines, keys) };
  } catch (error: unknown) {
    return fail(toClientError('Failed to suggest stock items', error, 'read'));
  }
}

export async function addStockItems(items: ItemSuggestion[]) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const vendorIds = [...new Set(items.map((i) => i.vendorId).filter((v): v is string => !!v && UUID.test(v)))];
    const owned = new Set((await prisma.vendor.findMany({
      where: { id: { in: vendorIds }, restaurantId: owner.restaurantId }, select: { id: true },
    })).map((v) => v.id));
    const created = await prisma.stockItem.createMany({
      data: items.slice(0, 200).map((i) => ({
        restaurantId: owner.restaurantId,
        name: String(i.name).slice(0, 200),
        normalizedName: String(i.normalizedName).slice(0, 200),
        unit: (i.unit ?? '').slice(0, 20),
        vendorId: i.vendorId && owned.has(i.vendorId) ? i.vendorId : null,
      })),
      skipDuplicates: true,
    });
    revalidatePath('/dashboard');
    return { success: true as const, data: { added: created.count } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to add stock items', error, 'write'));
  }
}

export async function updateStockItem(input: { id: string; minQuantity?: number | null; shelf?: string | null; active?: boolean }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    if (input.minQuantity != null && !(input.minQuantity >= 0 && input.minQuantity < 1_000_000)) return fail('stock.errors.invalidMin');
    const updated = await prisma.stockItem.updateMany({
      where: { id: input.id, restaurantId: owner.restaurantId },
      data: {
        ...(input.minQuantity !== undefined && { minQuantity: input.minQuantity }),
        ...(input.shelf !== undefined && { shelf: input.shelf?.trim().slice(0, 60) || null }),
        ...(input.active !== undefined && { active: input.active }),
      },
    });
    if (updated.count === 0) return fail('stock.errors.notFound');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to update the stock item', error, 'write'));
  }
}

/**
 * Saves a count. Each line keeps the average price of the day. Answers with
 * what was really used since each item's previous count, and what it cost.
 */
export async function saveStockCount(input: { kind: 'FULL' | 'ESSENTIAL'; lines: Array<{ itemId: string; quantity: number }> }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const lines = input.lines.filter((l) => UUID.test(l.itemId) && Number.isFinite(l.quantity) && l.quantity >= 0 && l.quantity < 1_000_000);
    if (lines.length === 0) return fail('stock.errors.emptyCount');

    // Read before writing: "before" is the state this count replaces.
    const before = new Map((await loadRows(owner.restaurantId)).map((r) => [r.id, r]));
    const valid = lines.filter((l) => before.has(l.itemId));
    if (valid.length === 0) return fail('stock.errors.emptyCount');

    await prisma.stockCount.create({
      data: {
        restaurantId: owner.restaurantId,
        kind: input.kind === 'ESSENTIAL' ? 'ESSENTIAL' : 'FULL',
        countedById: owner.userId,
        lines: {
          create: valid.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: before.get(l.itemId)!.averageCost })),
        },
      },
    });

    // Used since the previous count: what was there (the estimate already
    // includes what came in since) minus what is there now.
    let usedCost = 0;
    let measured = 0;
    const gaps: string[] = [];
    for (const l of valid) {
      const row = before.get(l.itemId)!;
      if (row.onHand === null || row.lastCount === null) continue;
      const purchased = row.onHand - row.lastCount.quantity;
      const used = usage(row.lastCount.quantity, purchased, l.quantity);
      measured++;
      if (used < 0) gaps.push(row.name);
      else if (row.averageCost !== null) usedCost += used * row.averageCost;
    }

    revalidatePath('/dashboard');
    return { success: true as const, data: { saved: valid.length, measured, usedCost: cents(usedCost), gaps: gaps.slice(0, 5) } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to save the count', error, 'write'));
  }
}
