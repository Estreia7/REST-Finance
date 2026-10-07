'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import {
  totalsByProduct,
  rankModifiers,
  monthlySeries,
  extremes,
  isModifierFamilia,
  isNonSalesFamilia,
  MODIFIER_FAMILIA_NAMES,
  type SaleRow,
  type ProductTotals,
} from '@/lib/products';
import { monthProgress, type MonthProgress } from '@/lib/trading-days';

/**
 * Reading the product side of the POS import.
 *
 * Its own file rather than more of `actions.ts`, which is already long: these
 * all read one pair of tables and none of them is needed by anything that
 * does not ask about products.
 */

/** A year the import actually covers, so the arrows stop at the edges. */
async function productYears(restaurantId: string): Promise<number[]> {
  const [first, last] = await Promise.all([
    prisma.posProductSale.findFirst({
      where: { restaurantId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    prisma.posProductSale.findFirst({
      where: { restaurantId },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);

  if (!first || !last) return [];

  const from = first.date.getUTCFullYear();
  const to = last.date.getUTCFullYear();
  return Array.from({ length: to - from + 1 }, (_, i) => to - i);
}

function validYear(year?: number): number | null {
  const target = year ?? new Date().getFullYear();
  if (!Number.isInteger(target) || target < 2000 || target > 2100) return null;
  return target;
}

/** Every sale row for a year, flattened to what `lib/products` wants. */
async function saleRows(restaurantId: string, year: number): Promise<SaleRow[]> {
  const rows = await prisma.posProductSale.findMany({
    where: {
      restaurantId,
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      },
    },
    select: {
      productId: true,
      date: true,
      quantity: true,
      revenue: true,
      product: {
        select: {
          code: true,
          name: true,
          subFamily: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    productId: r.productId,
    code: r.product.code,
    name: r.product.name,
    familia: r.product.category?.name ?? null,
    subFamily: r.product.subFamily,
    monthIndex: r.date.getUTCMonth(),
    quantity: r.quantity,
    revenue: Number(r.revenue),
  }));
}

export interface ProductAnalysis {
  year: number;
  availableYears: number[];
  /** Real products, biggest takings first. Modifiers are not in here. */
  products: ProductTotals[];
  /** The families products fall under, for the filter. */
  familias: string[];
  best: ProductTotals | null;
  worst: ProductTotals | null;
  /** The year's product takings, which the shares are a share of. */
  total: number;
  /** Units sold per month, every product added together. */
  monthly: Array<{ monthIndex: number; quantity: number; revenue: number }>;
}

/**
 * Everything the Produtos tab needs for a year, in one call.
 *
 * One query and one pass: a year is a few thousand rows, and three round
 * trips to compute three views of the same rows would be slower than
 * reading them once.
 */
export async function getProductAnalysis(year?: number) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const target = validYear(year);
    if (target === null) return { error: 'errors.read' };

    const [rows, availableYears] = await Promise.all([
      saleRows(owner.restaurantId, target),
      productYears(owner.restaurantId),
    ]);

    // Modifiers are excluded here and ranked separately: they all ring at
    // zero, so they would fill the bottom of a takings table with hundreds of
    // rows the owner cannot act on. Staff meals go too — they are rung at
    // nothing so the stock comes off, and they are a cost, not a sale.
    const productRows = rows.filter(
      (r) => !isModifierFamilia(r.familia) && !isNonSalesFamilia(r.familia),
    );
    const products = totalsByProduct(productRows);
    const total = products.reduce((s, p) => s + p.revenue, 0);
    // Re-run with the total so each share is of the year, which is what a
    // filtered view in the client needs to stay honest.
    const withShares = totalsByProduct(productRows, total);

    return {
      success: true,
      data: {
        year: target,
        availableYears,
        products: withShares,
        familias: [...new Set(productRows.map((r) => r.familia).filter((f): f is string => !!f))].sort(),
        ...extremes(withShares),
        total: Math.round((total + Number.EPSILON) * 100) / 100,
        monthly: monthlySeries(productRows),
      } satisfies ProductAnalysis,
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read product sales', error, 'read') };
  }
}

/**
 * One product over the twelve months of a year.
 *
 * Separate from the table because the owner picks a product and expects the
 * chart to change; sending every product's monthly series up front would be
 * tens of thousands of numbers for one line.
 */
export async function getProductMonthly(productId: string, year?: number) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const target = validYear(year);
    if (target === null) return { error: 'errors.read' };
    if (!productId) return { error: 'errors.read' };

    // Scoped to the restaurant as well as the product, so a product id from
    // somewhere else reads as empty rather than as someone else's sales.
    const product = await prisma.posProduct.findFirst({
      where: { id: productId, restaurantId: owner.restaurantId },
      select: {
        id: true,
        code: true,
        name: true,
        subFamily: true,
        category: { select: { name: true } },
      },
    });
    if (!product) return { error: 'errors.read' };

    const rows = await prisma.posProductSale.findMany({
      where: {
        restaurantId: owner.restaurantId,
        productId,
        date: {
          gte: new Date(Date.UTC(target, 0, 1)),
          lte: new Date(Date.UTC(target, 11, 31, 23, 59, 59)),
        },
      },
      select: { date: true, quantity: true, revenue: true },
    });

    const series = monthlySeries(
      rows.map((r) => ({
        productId,
        code: product.code,
        name: product.name,
        familia: product.category?.name ?? null,
        subFamily: product.subFamily,
        monthIndex: r.date.getUTCMonth(),
        quantity: r.quantity,
        revenue: Number(r.revenue),
      })),
    );

    return {
      success: true,
      data: {
        year: target,
        product: {
          id: product.id,
          code: product.code,
          name: product.name,
          familia: product.category?.name ?? null,
          subFamily: product.subFamily,
        },
        monthly: series,
        quantity: series.reduce((s, m) => s + m.quantity, 0),
        revenue: Math.round((series.reduce((s, m) => s + m.revenue, 0) + Number.EPSILON) * 100) / 100,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read product history', error, 'read') };
  }
}

/**
 * The ingredients the kitchen was asked for most.
 *
 * Ranked on units because every one of them rings at nothing — they exist so
 * the kitchen display knows what goes on the burger. Over the last twelve
 * months rather than the calendar year, so a ranking read in January is not
 * three weeks of data.
 */
export async function getTopIngredients(limit = 10) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const capped = Math.min(Math.max(Math.trunc(limit) || 10, 1), 50);

    const to = new Date();
    const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));

    const rows = await prisma.posProductSale.findMany({
      where: {
        restaurantId: owner.restaurantId,
        date: { gte: from },
        // Only the modifier families are worth reading: narrowing in the
        // query keeps this off the hundreds of thousands of product rows.
        product: { category: { name: { in: MODIFIER_FAMILIA_NAMES, mode: 'insensitive' } } },
      },
      select: {
        productId: true,
        date: true,
        quantity: true,
        revenue: true,
        product: {
          select: { code: true, name: true, subFamily: true, category: { select: { name: true } } },
        },
      },
    });

    const ranked = rankModifiers(
      rows.map((r) => ({
        productId: r.productId,
        code: r.product.code,
        name: r.product.name,
        familia: r.product.category?.name ?? null,
        subFamily: r.product.subFamily,
        monthIndex: r.date.getUTCMonth(),
        quantity: r.quantity,
        revenue: Number(r.revenue),
      })),
      capped,
    );

    return {
      success: true,
      data: {
        from: from.toISOString().slice(0, 10),
        items: ranked.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity })),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read ingredient ranking', error, 'read') };
  }
}

/**
 * How the current month is going: days traded, days left, and where it lands.
 *
 * Trading days come from what the restaurant recorded rather than from the
 * calendar, because a restaurant that shuts Mondays has four fewer days than
 * the calendar claims and a calendar-day average reads about 15% low.
 */
export async function getMonthProgress() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const from = new Date(Date.UTC(year, month, 1));
    const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

    const [summaries, closures] = await Promise.all([
      prisma.dailySummary.findMany({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          date: { gte: from, lte: to },
        },
        select: { date: true, revenueTotal: true },
      }),
      prisma.scheduleClosure.findMany({
        where: { restaurantId: owner.restaurantId, date: { gte: from, lte: to } },
        select: { date: true },
      }),
    ]);

    const progress = monthProgress({
      today: new Date(Date.UTC(year, month, now.getUTCDate())),
      revenueByDate: summaries.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        revenue: Number(s.revenueTotal),
      })),
      closedDates: closures.map((c) => c.date.toISOString().slice(0, 10)),
    });

    return { success: true, data: progress satisfies MonthProgress };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read month progress', error, 'read') };
  }
}
