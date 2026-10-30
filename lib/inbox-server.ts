import { prisma } from '@/lib/prisma';
import { dayKey } from '@/lib/ai-usage';
import { dueDateFor, paymentState, toDayKey } from '@/lib/payments';
import { statusFor } from '@/lib/compliance';
import { findDuplicateCosts } from '@/lib/duplicate-costs-server';
import { findDuplicateVendorGroups } from '@/lib/duplicate-vendors-server';
import type { InboxCounts } from '@/lib/inbox';

/**
 * Counts what the "Precisa de ti" inbox shows, for one restaurant.
 *
 * Each figure comes from the same rule its own tab uses — payment state from
 * lib/payments, duplicates from the duplicate finders, expiry from
 * lib/compliance — so the inbox can never say there are three overdue
 * invoices while Payments shows two. Callers authorise first.
 */

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function readInboxCounts(restaurantId: string): Promise<InboxCounts> {
  const todayKey = dayKey(new Date());

  const [unpaid, duplicates, vendorGroups, lines, costs, docs] = await Promise.all([
    // The same rows Payments reads: originals only, a split's parts belong to it.
    prisma.costEntry.findMany({
      where: { restaurantId, deletedAt: null, splitFromId: null, paidAt: null },
      select: {
        date: true,
        amount: true,
        dueDate: true,
        paymentMethod: true,
        vendor: { select: { paymentTermsDays: true } },
        splitParts: { where: { deletedAt: null }, select: { amount: true } },
      },
    }),
    findDuplicateCosts(restaurantId),
    findDuplicateVendorGroups(restaurantId),
    prisma.invoiceItem.aggregate({
      where: {
        restaurantId,
        categoryId: null,
        OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }],
      },
      _count: { _all: true },
      _sum: { totalPrice: true },
    }),
    // A split invoice's parts carry the categories; the original does not need one.
    prisma.costEntry.aggregate({
      where: { restaurantId, deletedAt: null, categoryId: null, splitParts: { none: {} } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.complianceDoc.findMany({
      where: { restaurantId, deletedAt: null, expiresAt: { not: null } },
      select: { expiresAt: true },
    }),
  ]);

  let overdueCount = 0;
  let overdueTotal = 0;
  for (const e of unpaid) {
    const dueKey = dueDateFor({
      dateKey: toDayKey(e.date),
      dueKey: e.dueDate ? toDayKey(e.dueDate) : null,
      hasVendor: !!e.vendor,
      termsDays: e.vendor?.paymentTermsDays,
    });
    if (paymentState({ paidKey: null, method: e.paymentMethod, dueKey }, todayKey) !== 'overdue') continue;
    overdueCount++;
    overdueTotal += Number(e.amount) + e.splitParts.reduce((s, p) => s + Number(p.amount), 0);
  }

  const now = new Date();
  const statuses = docs.map((d) => statusFor(d.expiresAt, now));

  return {
    overdue: { count: overdueCount, total: cents(overdueTotal) },
    duplicateCosts: {
      count: duplicates.length,
      total: cents(duplicates.reduce((s, d) => s + d.amount, 0)),
    },
    duplicateVendors: vendorGroups.length,
    uncategorisedLines: {
      count: lines._count._all,
      total: cents(Number(lines._sum.totalPrice ?? 0)),
    },
    uncategorisedCosts: {
      count: costs._count._all,
      total: cents(Number(costs._sum.amount ?? 0)),
    },
    complianceExpired: statuses.filter((s) => s === 'expired').length,
    complianceExpiring: statuses.filter((s) => s === 'expiring').length,
  };
}
