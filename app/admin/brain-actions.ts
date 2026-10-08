'use server';

import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import { planIngredientPrices, repriceIngredients } from '@/lib/ingredient-costs-server';
import { summariseBrain, type AttentionRow } from '@/lib/brain-summary';

/** How far back the efficacy figures look. Long enough to show a trend. */
const WINDOW_DAYS = 90;

/**
 * A ingredient cost more than this far from what its newest invoice says is
 * flagged: rounding never moves a price by one per cent, a bag read as a kilo
 * moves it by a factor.
 */
const DRIFT = 0.01;

/**
 * What one restaurant's brain knows, how well its invoices are being read,
 * and which ingredient costs look wrong.
 *
 * Read-only. The administrator looks here to answer "is the reading working
 * for this client?" with figures, and to find the mistakes worth a prompt
 * change.
 */
export async function getRestaurantBrain(restaurantId: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

    const [memories, links, items, scans, corrections, plan] = await Promise.all([
      prisma.invoiceLineMemory.findMany({
        where: { restaurantId },
        select: {
          sourceName: true, vendorId: true, notIngredient: true, packAmount: true, packUnit: true,
          confirmations: true, lastSeenAt: true,
          vendor: { select: { name: true } },
          category: { select: { name: true } },
        },
      }),
      prisma.invoiceItemLink.findMany({
        where: { restaurantId, ingredient: { deletedAt: null } },
        select: { sourceName: true, vendorId: true, ingredient: { select: { name: true } } },
      }),
      prisma.invoiceItem.findMany({
        where: { restaurantId, createdAt: { gte: since } },
        select: { categorySource: true, createdAt: true, receiptScanId: true },
      }),
      prisma.receiptScan.findMany({
        where: { restaurantId, scanType: 'COST_RECEIPT', createdAt: { gte: since } },
        select: { id: true, reviewedAt: true },
      }),
      prisma.scanCorrection.findMany({
        where: { restaurantId, createdAt: { gte: since } },
        select: {
          receiptScanId: true, productName: true, field: true, readValue: true, savedValue: true,
          fixedBy: true, createdAt: true, vendor: { select: { name: true } },
        },
      }),
      planIngredientPrices(restaurantId),
    ]);

    // Costs that disagree with the invoices behind them, or that no invoice
    // line can state in the ingredient's unit — the second is a bag with no
    // size, which is exactly how a bag's price became a kilo's.
    const attention: AttentionRow[] = [];
    for (const p of plan) {
      if (p.next && p.current !== null && Math.abs(p.next.cost - p.current) > Math.abs(p.current) * DRIFT) {
        attention.push({
          ingredientId: p.ingredientId, name: p.name, unit: p.unit,
          current: p.current, expected: p.next.cost, productName: p.next.productName, kind: 'wrong',
        });
      } else if (!p.next && p.lineCount > 0 && p.current !== null) {
        attention.push({
          ingredientId: p.ingredientId, name: p.name, unit: p.unit,
          current: p.current, expected: null, productName: null, kind: 'unpriceable',
        });
      }
    }

    const summary = summariseBrain({
      memories: memories.map((m) => ({
        sourceName: m.sourceName,
        vendorId: m.vendorId,
        vendorName: m.vendor?.name ?? null,
        categoryName: m.category?.name ?? null,
        notIngredient: m.notIngredient,
        packAmount: m.packAmount === null ? null : Number(m.packAmount),
        packUnit: m.packUnit,
        confirmations: m.confirmations,
        lastSeenAt: m.lastSeenAt,
      })),
      links: links.map((l) => ({ sourceName: l.sourceName, vendorId: l.vendorId, ingredientName: l.ingredient.name })),
      items,
      scans,
      corrections: corrections.map((c) => ({
        receiptScanId: c.receiptScanId,
        productName: c.productName,
        field: c.field,
        readValue: c.readValue,
        savedValue: c.savedValue,
        fixedBy: c.fixedBy,
        vendorName: c.vendor?.name ?? null,
        createdAt: c.createdAt,
      })),
      attention,
    });

    return { success: true, data: { ...summary, windowDays: WINDOW_DAYS } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the restaurant brain', error, 'read') };
  }
}

/**
 * Recomputes every ingredient cost of one restaurant from its invoices.
 *
 * The repair for costs written before prices were stated in the
 * ingredient's unit: a bag of sweet potatoes stored as the price of a kilo
 * is corrected from the same invoice, read properly. Prices pinned by hand
 * are left alone.
 */
export async function recomputeRestaurantCosts(restaurantId: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) return { error: 'admin.brain.notFound' };

    // Counted by price, not by write: a cost re-dated to the same figure is
    // not a cost that was wrong.
    const plan = await planIngredientPrices(restaurantId);
    const changed = plan.filter(
      (p) => p.action === 'update' && p.next && (p.current === null || Math.abs(p.current - p.next.cost) >= 0.00005),
    ).length;
    await repriceIngredients(restaurantId);

    await prisma.auditLog.create({
      data: {
        restaurantId,
        action: 'admin.ingredients.reprice',
        actorUserId: admin.userId,
        metadata: { changed },
      },
    });

    return { success: true, data: { changed } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to recompute costs', error, 'write') };
  }
}
