import { prisma } from '@/lib/prisma';

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
 * The longer name wins when a NIF turns up again, because a reading that
 * got the full registered name is the better reading.
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
      if (trimmed.length > byTax.name.length) {
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
