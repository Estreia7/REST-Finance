import { prisma } from './prisma';
import { nextConfirmations } from './invoice-categories';
import { packColumns, type RememberedPack } from './invoice-matching';
import { restateLine } from './line-setup';

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

/**
 * Teaches what one package of a wording holds, on its own.
 *
 * Remembered for the next invoice, and written onto every line already saved
 * under that wording. With that known, a line already linked to an ingredient has nothing left to ask.
 *
 * Not a server action: it trusts the ids it is given, and callers check them.
 */
export async function teachPack(input: {
  restaurantId: string;
  vendorId: string;
  sourceName: string;
  pack: RememberedPack;
}): Promise<void> {
  const { restaurantId, vendorId, sourceName, pack } = input;
  const [items, links] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: { restaurantId, vendorId, productName: { equals: sourceName, mode: 'insensitive' } },
      select: { id: true, quantity: true, unit: true, totalPrice: true, packFactor: true },
    }),
    prisma.invoiceItemLink.count({ where: { restaurantId, sourceName, vendorId } }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const restated = restateLine({
        quantity: Number(item.quantity),
        unit: item.unit,
        total: Number(item.totalPrice),
        packFactor: item.packFactor === null ? null : Number(item.packFactor),
      }, pack);
      if (restated) await tx.invoiceItem.update({ where: { id: item.id }, data: restated });
    }
    if (links > 0) {
      await tx.invoiceItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { needsSetup: false },
      });
    }
  }, { timeout: 30_000 });

  await rememberLine(restaurantId, vendorId, sourceName, null, null, pack);
}
