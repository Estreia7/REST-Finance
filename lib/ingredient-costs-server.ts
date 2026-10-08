import { prisma } from './prisma';
import { costPerIngredientUnit } from './ingredient-costs';
import { rememberedPack, type RememberedPack } from './invoice-matching';

/**
 * Points ingredients at their newest invoice price, in their own unit.
 *
 * The one place an ingredient's invoice cost is worked out. There used to be
 * four — after a scan, on opening the menu, after deleting an invoice, after
 * linking a wording — each copying a line's unit price across without asking
 * what it was a price *of*. They now all come here.
 *
 * An ingredient is priced from the lines that name it: the same normalised
 * name, or a supplier wording the owner linked to it. The newest line whose
 * price can be stated per the ingredient's unit wins; one that cannot (a bag
 * with no size to read) is passed over rather than trusted.
 *
 * A price the owner pinned by hand is never touched — it wins when a dish is
 * costed. The invoice figure beside it is still kept current, because it is
 * what the owner compares their pinned price against.
 *
 * Split in two, so the administrator can see what would change before
 * anything does: `planIngredientPrices` reads, `repriceIngredients` writes.
 *
 * Not server actions: they trust the restaurant id they are given.
 */

export interface PriceOptions {
  /** Only these ingredients. */
  ingredientIds?: string[];
  /** Only ingredients these invoice lines could have priced. */
  touching?: { normalizedNames: string[]; sourceNames: string[] };
  /**
   * Clear the cost of an ingredient no surviving line names, as after an
   * invoice is deleted. Left off, an ingredient with no lines keeps its
   * figure.
   */
  clearWhenNone?: boolean;
}

export interface PricePlan {
  ingredientId: string;
  name: string;
  unit: string;
  /** What is stored now. */
  current: number | null;
  currentAt: Date | null;
  /** What the newest usable line says, or null when none can price it. */
  next: { cost: number; at: Date; productName: string; lineUnit: string | null } | null;
  /** How many invoice lines name this ingredient, priceable or not. */
  lineCount: number;
  /** What to write: a new figure, a clearing, or nothing. */
  action: 'update' | 'clear' | 'keep';
}

export async function planIngredientPrices(
  restaurantId: string,
  options: PriceOptions = {},
): Promise<PricePlan[]> {
  const { ingredientIds, touching, clearWhenNone = false } = options;

  let linkedIds: string[] = [];
  if (touching?.sourceNames.length) {
    const links = await prisma.invoiceItemLink.findMany({
      where: { restaurantId, sourceName: { in: touching.sourceNames } },
      select: { ingredientId: true },
    });
    linkedIds = links.map((l) => l.ingredientId);
  }

  const ingredients = await prisma.ingredient.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      ...(ingredientIds ? { id: { in: ingredientIds } } : {}),
      ...(touching
        ? { OR: [{ normalizedName: { in: touching.normalizedNames } }, { id: { in: linkedIds } }] }
        : {}),
    },
    select: {
      id: true, name: true, unit: true, normalizedName: true,
      invoiceUnitCost: true, invoiceCostAt: true,
    },
  });
  if (ingredients.length === 0) return [];

  const links = await prisma.invoiceItemLink.findMany({
    where: { restaurantId, ingredientId: { in: ingredients.map((i) => i.id) } },
    select: { ingredientId: true, sourceName: true },
  });
  const wordingsOf = new Map<string, Set<string>>();
  for (const link of links) {
    const set = wordingsOf.get(link.ingredientId) ?? new Set<string>();
    set.add(link.sourceName);
    wordingsOf.set(link.ingredientId, set);
  }
  const allWordings = [...new Set(links.map((l) => l.sourceName))];

  // What the owner said each wording's package holds, so a line billed by
  // the bag before the size was learned is still priced per kilo.
  const memories = await prisma.invoiceLineMemory.findMany({
    where: { restaurantId, packUnit: { not: null } },
    select: { sourceName: true, packAmount: true, packUnit: true },
  });
  const packs = new Map<string, RememberedPack>();
  for (const m of memories) {
    const pack = rememberedPack(m);
    if (pack) packs.set(m.sourceName, pack);
  }

  const items = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      // A line under a deleted cost is a purchase that, for the books, did
      // not happen.
      OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }],
      AND: {
        OR: [
          { normalizedName: { in: [...new Set(ingredients.map((i) => i.normalizedName))] } },
          ...allWordings.map((w) => ({ productName: { equals: w, mode: 'insensitive' as const } })),
        ],
      },
    },
    orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      productName: true, normalizedName: true, quantity: true, unit: true,
      unitPrice: true, totalPrice: true, invoiceDate: true, createdAt: true,
    },
  });

  return ingredients.map((ingredient) => {
    const wordings = wordingsOf.get(ingredient.id) ?? new Set<string>();
    const lines = items.filter(
      (item) =>
        item.normalizedName === ingredient.normalizedName ||
        wordings.has(item.productName.trim().toLowerCase()),
    );

    let next: PricePlan['next'] = null;
    for (const item of lines) {
      const cost = costPerIngredientUnit(
        ingredient.unit,
        {
          productName: item.productName,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          total: Number(item.totalPrice),
        },
        packs.get(item.productName.trim().toLowerCase()) ?? null,
      );
      if (cost !== null) {
        next = { cost, at: item.invoiceDate ?? item.createdAt, productName: item.productName, lineUnit: item.unit };
        break;
      }
    }

    const current = ingredient.invoiceUnitCost === null ? null : Number(ingredient.invoiceUnitCost);
    let action: PricePlan['action'] = 'keep';
    if (next) {
      // Compared on the price as well as the date: a cost written before
      // this existed may be the right invoice priced the wrong way.
      const sameDate = ingredient.invoiceCostAt?.getTime() === next.at.getTime();
      if (current === null || Math.abs(current - next.cost) >= 0.00005 || !sameDate) action = 'update';
    } else if (clearWhenNone && lines.length === 0 && current !== null) {
      action = 'clear';
    }

    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      current,
      currentAt: ingredient.invoiceCostAt,
      next,
      lineCount: lines.length,
      action,
    };
  });
}

export async function repriceIngredients(
  restaurantId: string,
  options: PriceOptions = {},
): Promise<number> {
  const plan = await planIngredientPrices(restaurantId, options);
  // Only what moved, so opening the menu is not a write storm.
  const updates = plan
    .filter((p) => p.action !== 'keep')
    .map((p) =>
      prisma.ingredient.update({
        where: { id: p.ingredientId },
        data: p.action === 'update' && p.next
          ? { invoiceUnitCost: p.next.cost, invoiceCostAt: p.next.at }
          : { invoiceUnitCost: null, invoiceCostAt: null },
      }),
    );
  if (updates.length > 0) await prisma.$transaction(updates);
  return updates.length;
}
