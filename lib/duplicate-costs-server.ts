import { prisma } from '@/lib/prisma';
import { toDayKey } from '@/lib/payments';
import { findDuplicates, type DuplicateMatch, type InvoiceCost, type OrphanCost } from './duplicate-costs';

/**
 * The database side of finding and joining costs counted twice.
 *
 * Not server actions, and must not become them: they trust the restaurant id
 * they are given. Callers authorise first (app/dashboard/payment-actions.ts).
 */

/** The invoice an old cost duplicates, as the owner is shown it. */
export interface DuplicateSuggestion {
  orphanId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  vendorName: string | null;
  dateKey: string;
  amount: number;
  matched: number;
  lines: number;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Every old cost that looks like an invoice already on file, with that invoice. */
export async function findDuplicateCosts(restaurantId: string): Promise<DuplicateSuggestion[]> {
  const live = { restaurantId, deletedAt: null, splitFromId: null };

  const orphanRows = await prisma.costEntry.findMany({
    where: {
      ...live,
      invoiceNumber: null,
      recurringCostId: null,
      invoiceItems: { none: {} },
      splitParts: { none: { deletedAt: null } },
      description: { not: null },
    },
    select: { id: true, description: true, amount: true, date: true, vendorId: true },
  });
  if (orphanRows.length === 0) return [];

  const invoiceRows = await prisma.costEntry.findMany({
    where: { ...live, invoiceItems: { some: {} } },
    select: {
      id: true,
      date: true,
      amount: true,
      invoiceNumber: true,
      vendor: { select: { id: true, name: true } },
      splitParts: { where: { deletedAt: null }, select: { amount: true } },
      // Lines of the split parts hang off the parts, not the root.
      invoiceItems: { select: { productName: true, invoiceNumber: true } },
    },
  });
  const partLines = await prisma.invoiceItem.findMany({
    where: { restaurantId, costEntry: { deletedAt: null, splitFromId: { in: invoiceRows.map((r) => r.id) } } },
    select: { productName: true, costEntry: { select: { splitFromId: true } } },
  });
  const extraLines = new Map<string, string[]>();
  for (const line of partLines) {
    const root = line.costEntry?.splitFromId;
    if (!root) continue;
    extraLines.set(root, [...(extraLines.get(root) ?? []), line.productName]);
  }

  const orphans: OrphanCost[] = orphanRows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    dateKey: toDayKey(r.date),
    vendorId: r.vendorId,
  }));
  const invoices: InvoiceCost[] = invoiceRows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber?.trim() || r.invoiceItems[0]?.invoiceNumber?.trim() || null,
    vendorId: r.vendor?.id ?? null,
    vendorName: r.vendor?.name ?? null,
    dateKey: toDayKey(r.date),
    amount: cents(Number(r.amount) + r.splitParts.reduce((s, p) => s + Number(p.amount), 0)),
    lineNames: [...r.invoiceItems.map((i) => i.productName), ...(extraLines.get(r.id) ?? [])],
  }));

  const byId = new Map(invoices.map((i) => [i.id, i]));
  return findDuplicates(orphans, invoices).map((m: DuplicateMatch) => {
    const invoice = byId.get(m.invoiceId)!;
    return {
      orphanId: m.orphanId,
      invoiceId: m.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      dateKey: invoice.dateKey,
      amount: invoice.amount,
      matched: m.matched,
      lines: m.lines,
    };
  });
}

export type MergeResult = { ok: true } | { ok: false; error: string };

/**
 * Joins an old cost into the invoice it duplicates.
 *
 * The invoice stays: it has the lines, the categories and the right date. The
 * old cost is soft deleted, so it leaves the P&L and what is owed but can be
 * brought back. If the owner had already paid the old one, the invoice is
 * marked paid the same way — that payment was for this purchase.
 */
export async function mergeDuplicateCost(input: {
  restaurantId: string;
  userId: string;
  duplicateId: string;
  invoiceId: string;
}): Promise<MergeResult> {
  if (input.duplicateId === input.invoiceId) return { ok: false, error: 'payments.mergeInvalid' };

  return prisma.$transaction(async (tx) => {
    const live = { restaurantId: input.restaurantId, deletedAt: null, splitFromId: null };

    const duplicate = await tx.costEntry.findFirst({
      where: { ...live, id: input.duplicateId },
      select: {
        id: true, amount: true, date: true, description: true, vendorId: true,
        invoiceNumber: true, recurringCostId: true, paymentMethod: true, paidAt: true,
        _count: { select: { invoiceItems: true, splitParts: true } },
      },
    });
    const invoice = await tx.costEntry.findFirst({
      where: { ...live, id: input.invoiceId },
      select: {
        id: true, vendorId: true, paymentMethod: true, paidAt: true,
        _count: { select: { invoiceItems: true } },
      },
    });
    if (!duplicate || !invoice) return { ok: false as const, error: 'payments.notFound' };

    // Only a cost with no paper of its own is ever the duplicate: one with
    // lines or a number is an invoice in its own right.
    if (
      duplicate._count.invoiceItems > 0 || duplicate._count.splitParts > 0
      || duplicate.invoiceNumber || duplicate.recurringCostId
    ) {
      return { ok: false as const, error: 'payments.mergeInvalid' };
    }
    if (invoice._count.invoiceItems === 0) return { ok: false as const, error: 'payments.mergeInvalid' };

    const carryPayment = !invoice.paidAt && !invoice.paymentMethod
      && (duplicate.paidAt || duplicate.paymentMethod);

    await tx.costEntry.update({
      where: { id: invoice.id },
      data: {
        ...(carryPayment ? { paymentMethod: duplicate.paymentMethod, paidAt: duplicate.paidAt } : {}),
        ...(!invoice.vendorId && duplicate.vendorId ? { vendorId: duplicate.vendorId } : {}),
      },
    });
    await tx.costEntry.update({ where: { id: duplicate.id }, data: { deletedAt: new Date() } });

    await tx.auditLog.create({
      data: {
        restaurantId: input.restaurantId,
        actorUserId: input.userId,
        action: 'cost.duplicate.merge',
        metadata: {
          duplicateId: duplicate.id,
          invoiceId: invoice.id,
          amount: Number(duplicate.amount),
          date: toDayKey(duplicate.date),
          description: duplicate.description?.slice(0, 300) ?? null,
          paymentCarried: !!carryPayment,
        },
      },
    });

    return { ok: true as const };
  });
}
