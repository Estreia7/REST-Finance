import type { Prisma, CostType } from '@prisma/client';
import { splitInvoiceTotal } from './invoice-categories';

/**
 * Makes an invoice's cost entries match the categories of its lines.
 *
 * An invoice is saved as one cost entry, before anyone has said what its
 * lines are. Once they have categories, this shares the total out: the
 * original entry keeps the largest part and one entry per other category hangs
 * off it (`splitFromId`). Run again after a line changes category, it moves
 * the money to match: parts are reused where they exist, created where a new
 * category appears, and withdrawn where one no longer has any lines.
 *
 * The total of the invoice never changes here. It is whatever the entries
 * held between them, and the parts always add up to it to the cent.
 *
 * Not a server action, and must not become one: it trusts the ids it is
 * given. Callers check the entry belongs to the restaurant first.
 */
export async function rebalanceInvoice(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; costEntryId: string; userId: string },
): Promise<{ parts: number }> {
  const entry = await tx.costEntry.findFirst({
    where: { id: input.costEntryId, restaurantId: input.restaurantId, deletedAt: null },
    select: { id: true, splitFromId: true },
  });
  if (!entry) return { parts: 0 };

  const rootId = entry.splitFromId ?? entry.id;
  const root = await tx.costEntry.findFirst({
    where: { id: rootId, restaurantId: input.restaurantId, deletedAt: null },
  });
  if (!root) return { parts: 0 };

  const siblings = await tx.costEntry.findMany({
    where: { splitFromId: root.id, restaurantId: input.restaurantId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const entries = [root, ...siblings];

  const items = await tx.invoiceItem.findMany({
    where: { costEntryId: { in: entries.map((e) => e.id) }, restaurantId: input.restaurantId },
    select: { id: true, categoryId: true, totalPrice: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (items.length === 0) return { parts: entries.length };

  const grandTotal = entries.reduce((s, e) => s + Number(e.amount), 0);
  const parts = splitInvoiceTotal(
    items.map((i) => ({ categoryId: i.categoryId, total: Number(i.totalPrice) })),
    grandTotal,
  );

  const categoryIds = [
    ...new Set([...parts.map((p) => p.categoryId), ...entries.map((e) => e.categoryId)].filter(Boolean)),
  ] as string[];
  const categories = await tx.category.findMany({
    where: { id: { in: categoryIds }, restaurantId: input.restaurantId },
    select: { id: true, type: true },
  });
  const typeOf = (categoryId: string | null): CostType => {
    const type = categories.find((c) => c.id === categoryId)?.type;
    return type === 'COGS' || type === 'OPEX' ? type : root.type;
  };

  // The original keeps the largest part. The others reuse an entry already
  // holding their category, so a recategorised line moves money between
  // existing costs rather than churning new ones.
  const free = [...siblings];
  const assigned = parts.map((part, i) => {
    if (i === 0) return root;
    const same = free.findIndex((s) => s.categoryId === part.categoryId);
    if (same >= 0) return free.splice(same, 1)[0];
    return free.shift() ?? null;
  });

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let target = assigned[i];
    // Lines nobody categorised do not wipe a category the entry already
    // had: that is the invoice's own, and the best answer there is.
    const categoryId = part.categoryId ?? target?.categoryId ?? null;
    const data = {
      amount: part.amount,
      categoryId,
      type: typeOf(categoryId),
    };

    if (target) {
      await tx.costEntry.update({ where: { id: target.id }, data });
    } else {
      target = await tx.costEntry.create({
        data: {
          ...data,
          restaurantId: input.restaurantId,
          date: root.date,
          vendorId: root.vendorId,
          description: root.description,
          createdById: input.userId,
          splitFromId: root.id,
        },
      });
    }

    await tx.invoiceItem.updateMany({
      where: { id: { in: part.lines.map((l) => items[l].id) } },
      data: { costEntryId: target.id },
    });
  }

  // A category that no longer has any lines on this invoice has no cost
  // either. Withdrawn like any deleted cost, so the P&L stops counting it.
  if (free.length > 0) {
    await tx.costEntry.updateMany({
      where: { id: { in: free.map((f) => f.id) } },
      data: { deletedAt: new Date() },
    });
  }

  return { parts: parts.length };
}

/**
 * Every cost entry an invoice was split into, from any one of them.
 *
 * Deleting one part of an invoice deletes the invoice: leaving the beer
 * booked after the food was removed would keep half of a document the owner
 * meant to throw away.
 */
export async function invoiceEntryIds(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  costEntryId: string,
): Promise<string[]> {
  const entry = await tx.costEntry.findFirst({
    where: { id: costEntryId, restaurantId },
    select: { id: true, splitFromId: true },
  });
  if (!entry) return [];
  const rootId = entry.splitFromId ?? entry.id;
  const parts = await tx.costEntry.findMany({
    where: { splitFromId: rootId, restaurantId, deletedAt: null },
    select: { id: true },
  });
  return [rootId, ...parts.map((p) => p.id)];
}
