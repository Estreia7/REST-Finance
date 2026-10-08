import { prisma } from './prisma';
import { nextConfirmations } from './invoice-categories';
import { packColumns, type RememberedPack } from './invoice-matching';

/**
 * Records one answer in a restaurant's memory of invoice wordings.
 *
 * The same answer again makes it surer; a different one replaces it and
 * starts counting again. A missing category keeps the one already remembered:
 * saying "this is not an ingredient" is no reason to forget it was a drink.
 * Likewise a null `notIngredient` keeps what was remembered about that, and a
 * missing `pack` keeps what the package was said to hold.
 *
 * Not a server action: it trusts the ids it is given, and callers check them.
 */
export async function rememberLine(
  restaurantId: string,
  vendorId: string,
  sourceName: string,
  categoryId: string | null,
  notIngredient: boolean | null,
  /** What one package of this wording holds, or that it is counted in packages. */
  pack?: RememberedPack | null,
): Promise<void> {
  const where = { restaurantId_sourceName_vendorId: { restaurantId, sourceName, vendorId } };
  const previous = await prisma.invoiceLineMemory.findUnique({
    where,
    select: { categoryId: true, confirmations: true, notIngredient: true },
  });
  const category = categoryId ?? previous?.categoryId ?? null;
  const notAnIngredient = notIngredient ?? previous?.notIngredient ?? false;
  const packData = pack ? packColumns(pack) : {};

  await prisma.invoiceLineMemory.upsert({
    where,
    create: { restaurantId, sourceName, vendorId, categoryId: category, notIngredient: notAnIngredient, ...packData },
    update: {
      categoryId: category,
      notIngredient: notAnIngredient,
      ...packData,
      confirmations: nextConfirmations(previous, category),
      lastSeenAt: new Date(),
    },
  });
}
