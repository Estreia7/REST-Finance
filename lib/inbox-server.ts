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

  const [unpaid, duplicates, vendorGroups, lines, costs, docs, bank, emailed] = await Promise.all([
    // The same rows Payments reads: originals only, a split's parts belong to it.
    prisma.costEntry.findMany({
      where: { restaurantId, deletedAt: null, splitFromId: null, paidAt: null },
      select: {
        date: true,
        amount: true,
        dueDate: true,
        paymentMethod: true,
        paymentToConfirm: true,
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
    // Imported payments not yet matched to an invoice. Fees, income and cash
    // are not invoices, so they do not wait on the owner here.
    prisma.bankTransaction.aggregate({
      where: { restaurantId, status: 'OPEN', kind: 'PAYMENT' },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    // Emailed invoices not yet saved or set aside (the same rule as the list).
    prisma.receiptScan.findMany({
      where: { restaurantId, source: 'EMAIL', reviewedAt: null, linkedEntryId: null },
      select: { extractedData: true },
      take: 200,
    }),
  ]);

  const waiting = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      needsSetup: true,
      OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }],
    },
    select: { productName: true, vendorId: true, totalPrice: true },
    take: 2000,
  });
  const wordings = new Set(waiting.map((w) => `${w.vendorId ?? ''}|${w.productName.trim().toLowerCase()}`));

  const toReview = await prisma.receiptScan.findMany({
    where: { restaurantId, queued: true, reviewedAt: null, linkedEntryId: null },
    select: { extractedData: true },
    take: 200,
  });

  const unproved = await prisma.receiptScan.findMany({
    where: { restaurantId, proofStatus: 'failed', proofResolvedAt: null, linkedEntryId: { not: null } },
    select: { extractedData: true },
    take: 200,
  });

  const credits = await prisma.creditNote.aggregate({
    where: { restaurantId, status: 'open' },
    _count: { _all: true },
    _sum: { amount: true },
  });

  let overdueCount = 0;
  let overdueTotal = 0;
  let toConfirmCount = 0;
  let toConfirmTotal = 0;
  for (const e of unpaid) {
    // Not late until someone says it was not paid: it may well have been.
    if (e.paymentToConfirm) {
      toConfirmCount++;
      toConfirmTotal += Number(e.amount) + e.splitParts.reduce((s, p) => s + Number(p.amount), 0);
      continue;
    }
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
    paymentsToConfirm: { count: toConfirmCount, total: cents(toConfirmTotal) },
    scansToReview: {
      count: toReview.length,
      total: cents(toReview.reduce((s, e) => {
        const total = (e.extractedData as { grandTotal?: unknown } | null)?.grandTotal;
        return s + (typeof total === 'number' ? total : 0);
      }, 0)),
    },
    duplicateCosts: {
      count: duplicates.length,
      total: cents(duplicates.reduce((s, d) => s + d.amount, 0)),
    },
    duplicateVendors: vendorGroups.length,
    bankOpen: { count: bank._count._all, total: cents(Math.abs(Number(bank._sum.amount ?? 0))) },
    emailInvoices: {
      count: emailed.length,
      total: cents(emailed.reduce((s, e) => {
        const total = (e.extractedData as { grandTotal?: unknown } | null)?.grandTotal;
        return s + (typeof total === 'number' ? total : 0);
      }, 0)),
    },
    invoicesToConfirm: {
      count: unproved.length,
      total: cents(unproved.reduce((sum, s) => {
        const gap = (s.extractedData as { checks?: { proof?: { gap?: number } } } | null)?.checks?.proof?.gap;
        return sum + Math.abs(gap ?? 0);
      }, 0)),
    },
    creditNotes: { count: credits._count._all, total: cents(Number(credits._sum.amount ?? 0)) },
    linesToSetup: {
      count: wordings.size,
      total: cents(waiting.reduce((s, w) => s + Number(w.totalPrice), 0)),
    },
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
