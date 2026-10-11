import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { takesLongerName } from '@/lib/vendor-reading';

// Not a server action, and must not become one: it trusts the restaurant id
// it is given. Callers resolve it from the session first.

/**
 * The supplier, found by tax number first and by name only after.
 *
 * A NIF is one company; a name is however the reader happened to read the
 * letterhead that day. Matching on the name alone produced four suppliers
 * for one butcher — "Profunda Origem", "PROFUNDA ORIGEM", "PROFUNDA ORIGEM
 * - Profunda D'Origem-Comércio Carnes, Lda" — each with its own price
 * history, so no price comparison between them was possible and the same
 * invoice could be entered once under each.
 *
 * A fuller reading of the same name replaces the one on file. A different
 * name never does, however long: "DANIEL MARQUES ARAÚJO" is the customer an
 * invoice was addressed to, read off the wrong block, and letting it rename
 * Recheio would file every Recheio invoice after it under the owner's name.
 */
export async function ensureVendor(restaurantId: string, name: string, taxId?: string | null) {
  const trimmed = name.trim() || 'Fornecedor';
  const nif = taxId?.replace(/\D/g, '') || null;

  if (nif) {
    const byTax = await prisma.vendor.findFirst({
      where: { restaurantId, taxId: nif },
      select: { id: true, name: true },
    });
    if (byTax) {
      if (takesLongerName(byTax.name, trimmed)) {
        await prisma.vendor.update({ where: { id: byTax.id }, data: { name: trimmed } });
      }
      return { id: byTax.id };
    }
  }

  const byName = await prisma.vendor.findFirst({
    where: { restaurantId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true, taxId: true },
  });
  if (byName) {
    // A NIF learned later is worth keeping: it is what the next invoice
    // will be matched on.
    if (nif && !byName.taxId) {
      await prisma.vendor.update({ where: { id: byName.id }, data: { taxId: nif } });
    }
    return { id: byName.id };
  }

  return prisma.vendor.create({
    data: { restaurantId, name: trimmed, taxId: nif },
    select: { id: true },
  });
}

/**
 * The supplier, if already known — by tax number first, as `ensureVendor`
 * does. Looking it up by name alone missed every answer remembered for this
 * supplier whenever the reader spelled the letterhead differently.
 */
export async function findVendor(restaurantId: string, name: string, taxId?: string | null) {
  const nif = taxId?.replace(/\D/g, '') || null;
  if (nif) {
    const byTax = await prisma.vendor.findFirst({
      where: { restaurantId, taxId: nif },
      select: { id: true },
    });
    if (byTax) return byTax;
  }
  const trimmed = name.trim();
  if (!trimmed) return null;
  return prisma.vendor.findFirst({
    where: { restaurantId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
}

/**
 * Moves what was learned about some wordings from one supplier to another.
 *
 * A link ("this line is my Carne Smash") and a memory (its category, its pack
 * size) are kept against the supplier that printed the wording. When an
 * invoice turns out to be another supplier's, its answers go with it — or
 * the owner would be asked again about products already identified, and the
 * wrong supplier would keep answers for products it never sold.
 *
 * `copyOnly` wordings are copied rather than moved: the old supplier still
 * prints them on other invoices, and those answers are still true there.
 * Where the new supplier already has an answer, it keeps its own.
 */
export async function moveWordingAnswers(
  tx: Prisma.TransactionClient,
  input: {
    restaurantId: string;
    fromVendorId: string;
    toVendorId: string;
    wordings: string[];
    copyOnly: Set<string>;
  },
) {
  const { restaurantId, fromVendorId, toVendorId } = input;
  if (input.wordings.length === 0) return;

  const links = await tx.invoiceItemLink.findMany({
    where: { restaurantId, vendorId: fromVendorId, sourceName: { in: input.wordings } },
    select: { id: true, sourceName: true, ingredientId: true },
  });
  for (const link of links) {
    const clash = await tx.invoiceItemLink.findFirst({
      where: { restaurantId, vendorId: toVendorId, sourceName: link.sourceName, ingredientId: link.ingredientId },
      select: { id: true },
    });
    if (input.copyOnly.has(link.sourceName)) {
      if (!clash) {
        await tx.invoiceItemLink.create({
          data: { restaurantId, vendorId: toVendorId, sourceName: link.sourceName, ingredientId: link.ingredientId },
        });
      }
    } else if (clash) {
      await tx.invoiceItemLink.delete({ where: { id: link.id } });
    } else {
      await tx.invoiceItemLink.update({ where: { id: link.id }, data: { vendorId: toVendorId } });
    }
  }

  const memories = await tx.invoiceLineMemory.findMany({
    where: { restaurantId, vendorId: fromVendorId, sourceName: { in: input.wordings } },
  });
  for (const memory of memories) {
    const clash = await tx.invoiceLineMemory.findFirst({
      where: { restaurantId, vendorId: toVendorId, sourceName: memory.sourceName },
      select: { id: true },
    });
    if (input.copyOnly.has(memory.sourceName)) {
      if (!clash) {
        await tx.invoiceLineMemory.create({
          data: {
            restaurantId,
            vendorId: toVendorId,
            sourceName: memory.sourceName,
            categoryId: memory.categoryId,
            notIngredient: memory.notIngredient,
            packAmount: memory.packAmount,
            packUnit: memory.packUnit,
            confirmations: memory.confirmations,
            lastSeenAt: memory.lastSeenAt,
          },
        });
      }
    } else if (clash) {
      await tx.invoiceLineMemory.delete({ where: { id: memory.id } });
    } else {
      await tx.invoiceLineMemory.update({ where: { id: memory.id }, data: { vendorId: toVendorId } });
    }
  }
}

/**
 * Folds suppliers into one: their invoices, costs, fixed costs and learned
 * answers move to `keepId`, and they are deleted. Callers check every id is
 * this restaurant's first.
 */
export async function mergeVendorsTx(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; keepId: string; mergeIds: string[] },
) {
  const { restaurantId, keepId, mergeIds } = input;

  const items = await tx.invoiceItem.updateMany({
    where: { restaurantId, vendorId: { in: mergeIds } },
    data: { vendorId: keepId },
  });
  const costs = await tx.costEntry.updateMany({
    where: { restaurantId, vendorId: { in: mergeIds } },
    data: { vendorId: keepId },
  });
  // Fixed costs follow too, or next month's rent would book to a supplier
  // that no longer exists.
  await tx.recurringCost.updateMany({
    where: { restaurantId, vendorId: { in: mergeIds } },
    data: { vendorId: keepId },
  });
  // The reader's recorded mistakes stay attached to a supplier that exists.
  await tx.scanCorrection.updateMany({
    where: { restaurantId, vendorId: { in: mergeIds } },
    data: { vendorId: keepId },
  });

  // A remembered link belongs to a supplier's wording. Moved rather than
  // dropped, or the owner would be asked again about products they have
  // already identified. Conflicts are deleted: the kept supplier already has
  // that answer.
  const links = await tx.invoiceItemLink.findMany({
    where: { restaurantId, vendorId: { in: mergeIds } },
    select: { id: true, sourceName: true, ingredientId: true },
  });
  for (const link of links) {
    const clash = await tx.invoiceItemLink.findFirst({
      where: { restaurantId, vendorId: keepId, sourceName: link.sourceName, ingredientId: link.ingredientId },
      select: { id: true },
    });
    if (clash) await tx.invoiceItemLink.delete({ where: { id: link.id } });
    else await tx.invoiceItemLink.update({ where: { id: link.id }, data: { vendorId: keepId } });
  }

  // The same for what each wording's category was: deleting the supplier
  // would take those answers with it. Where both suppliers remember the same
  // wording, the surer answer stays.
  const memories = await tx.invoiceLineMemory.findMany({
    where: { restaurantId, vendorId: { in: mergeIds } },
    select: { id: true, sourceName: true, confirmations: true },
  });
  for (const memory of memories) {
    const clash = await tx.invoiceLineMemory.findFirst({
      where: { restaurantId, vendorId: keepId, sourceName: memory.sourceName },
      select: { id: true, confirmations: true },
    });
    if (clash && clash.confirmations >= memory.confirmations) {
      await tx.invoiceLineMemory.delete({ where: { id: memory.id } });
      continue;
    }
    if (clash) await tx.invoiceLineMemory.delete({ where: { id: clash.id } });
    await tx.invoiceLineMemory.update({ where: { id: memory.id }, data: { vendorId: keepId } });
  }

  await tx.vendor.deleteMany({ where: { id: { in: mergeIds }, restaurantId } });

  return { items: items.count, costs: costs.count };
}
