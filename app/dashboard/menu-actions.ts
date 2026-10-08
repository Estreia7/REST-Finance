'use server';

import { repriceIngredients } from '@/lib/ingredient-costs-server';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { normalizeProductName } from '@/lib/price-tracking';
import { costMenuItem, classify, RECIPE_UNITS, type RecipeLineInput } from '@/lib/menu-costing';

/**
 * The menu calculator's server side.
 *
 * Owner-only: what a dish costs and what it earns is the most commercially
 * sensitive thing in the app, and it names supplier prices line by line.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Refreshes ingredient costs from the invoices.
 *
 * Matched on the normalised product name, which is what price tracking
 * already uses, so an ingredient called "Bacalhau" picks up invoice lines for
 * "BACALHAU 1KG" without the owner mapping anything by hand. This is the
 * feature's real advantage over a spreadsheet: when a supplier raises a price,
 * the affected dishes move on their own.
 */
async function refreshInvoiceCosts(restaurantId: string) {
  // Also follows the wordings the owner linked, and states each price in the
  // ingredient's own unit — a bag is never a kilo.
  await repriceIngredients(restaurantId);
}

// ── Reading ────────────────────────────────────────────────────────────────

export async function getMenu() {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  await refreshInvoiceCosts(owner.restaurantId);

  const [items, ingredients] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        recipeLines: {
          orderBy: { sortOrder: 'asc' },
          include: { ingredient: true },
        },
        // The bought thing a resale item is the selling of. Its cost is the
        // item cost, so it travels with the item rather than being looked up.
        purchaseItem: true,
      },
    }),
    prisma.ingredient.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        // At most one by design, but a list is what a back-relation gives.
        soldAs: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  const costed = items.map((item) => {
    const lines: RecipeLineInput[] = item.recipeLines.map((line) => ({
      ingredientId: line.ingredientId,
      name: line.ingredient.name,
      quantity: Number(line.quantity),
      unit: line.unit,
      ingredient: {
        unit: line.ingredient.unit,
        manualUnitCost:
          line.ingredient.manualUnitCost === null ? null : Number(line.ingredient.manualUnitCost),
        invoiceUnitCost:
          line.ingredient.invoiceUnitCost === null ? null : Number(line.ingredient.invoiceUnitCost),
        wastePercent: Number(line.ingredient.wastePercent),
      },
    }));

    const costing = costMenuItem({
      priceGross: Number(item.priceGross),
      vatRate: Number(item.vatRate),
      lines,
      purchase:
        item.costingMode === 'PURCHASE' && item.purchaseItem
          ? {
              unit: item.purchaseItem.unit,
              manualUnitCost:
                item.purchaseItem.manualUnitCost === null
                  ? null
                  : Number(item.purchaseItem.manualUnitCost),
              invoiceUnitCost:
                item.purchaseItem.invoiceUnitCost === null
                  ? null
                  : Number(item.purchaseItem.invoiceUnitCost),
              wastePercent: Number(item.purchaseItem.wastePercent),
            }
          : null,
    });

    return {
      id: item.id,
      name: item.name,
      category: item.category,
      priceGross: Number(item.priceGross),
      vatRate: Number(item.vatRate),
      monthlyVolume: item.monthlyVolume,
      active: item.active,
      costingMode: item.costingMode,
      purchaseItemId: item.purchaseItemId,
      purchaseItemName: item.purchaseItem?.name ?? null,
      purchaseInvoiceCostAt: item.purchaseItem?.invoiceCostAt ?? null,
      needsReview: item.needsReview,
      costing,
    };
  });

  // Menu engineering compares a dish with the rest of the carte, so the
  // thresholds are this menu's own averages. Only dishes that are costed and
  // carry a volume take part: a dish with no recipe would drag the average
  // down and mislabel everything else.
  // Costed means costed, with or without a recipe. A drink sold as bought has
  // no lines and a real cost, and leaving it out of the averages would exclude
  // the thing earning a quarter of the takings from "what carries the room".
  const rated = costed.filter(
    (c) => !c.costing.incomplete && (c.costing.lines.length > 0 || c.costing.purchase !== null)
  );
  const withVolume = rated.filter((c) => c.monthlyVolume && c.monthlyVolume > 0);

  const avgGrossProfit =
    rated.length > 0 ? rated.reduce((s, c) => s + c.costing.grossProfit, 0) / rated.length : 0;
  const avgVolume =
    withVolume.length > 0
      ? withVolume.reduce((s, c) => s + (c.monthlyVolume ?? 0), 0) / withVolume.length
      : 0;

  return {
    success: true as const,
    data: {
      items: costed.map((c) => ({
        ...c,
        menuClass:
          withVolume.length >= 2 && c.monthlyVolume && !c.costing.incomplete
            ? classify(c.costing.grossProfit, c.monthlyVolume, avgGrossProfit, avgVolume)
            : null,
      })),
      ingredients: ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        // Set when this exists to cost a resale item rather than to go into a
        // recipe, so the ingredient list can keep bottles out of the lettuce.
        soldAsId: i.soldAs[0]?.id ?? null,
        unit: i.unit,
        manualUnitCost: i.manualUnitCost === null ? null : Number(i.manualUnitCost),
        invoiceUnitCost: i.invoiceUnitCost === null ? null : Number(i.invoiceUnitCost),
        invoiceCostAt: i.invoiceCostAt,
        wastePercent: Number(i.wastePercent),
      })),
      averages: { grossProfit: avgGrossProfit, volume: avgVolume },
    },
  };
}

// ── Ingredients ────────────────────────────────────────────────────────────

export async function saveIngredient(input: {
  id?: string;
  name: string;
  unit: string;
  manualUnitCost: number | null;
  wastePercent: number;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const name = input.name?.trim();
  if (!name) return fail('O nome é obrigatório');
  if (!['kg', 'L', 'un'].includes(input.unit)) return fail('Unidade inválida');

  const manual = input.manualUnitCost === null ? null : num(input.manualUnitCost);
  if (manual !== null && manual < 0) return fail('O preço não pode ser negativo');

  const waste = num(input.wastePercent) ?? 0;
  if (waste < 0 || waste > 99) return fail('A perda tem de estar entre 0% e 99%');

  const data = {
    name,
    normalizedName: normalizeProductName(name),
    unit: input.unit,
    manualUnitCost: manual,
    wastePercent: waste,
  };

  if (input.id) {
    const existing = await prisma.ingredient.findFirst({
      where: { id: input.id, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return fail('Ingrediente não encontrado');
    await prisma.ingredient.update({ where: { id: input.id }, data });
    return { success: true as const, data: { id: input.id } };
  }

  const created = await prisma.ingredient.create({
    data: { ...data, restaurantId: owner.restaurantId },
  });
  return { success: true as const, data: { id: created.id } };
}

/**
 * Removes an ingredient.
 *
 * Refuses while a recipe still uses it. Deleting it anyway would quietly make
 * every dish containing it cheaper, and a margin that is wrong without saying
 * so is worse than no margin at all.
 */
export async function deleteIngredient(id: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const ingredient = await prisma.ingredient.findFirst({
    where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!ingredient) return fail('Ingrediente não encontrado');

  const uses = await prisma.recipeLine.findMany({
    where: { ingredientId: id },
    select: { menuItem: { select: { name: true, deletedAt: true } } },
  });
  const live = uses.filter((u) => u.menuItem.deletedAt === null).map((u) => u.menuItem.name);

  if (live.length > 0) {
    const names = live.slice(0, 3).join(', ');
    const more = live.length > 3 ? ` e mais ${live.length - 3}` : '';
    return fail(`Ainda é usado em: ${names}${more}. Retire-o dessas receitas primeiro.`);
  }

  await prisma.$transaction([
    prisma.recipeLine.deleteMany({ where: { ingredientId: id } }),
    prisma.ingredient.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);

  return { success: true as const };
}


/**
 * Starts selling a bought thing exactly as it is bought.
 *
 * The Products page shows ingredients and single items side by side, and the
 * owner moves one across by dragging it. Moving it this way is not a label
 * change: a single item is a thing on the menu with a price, so this creates
 * that menu item and points it back at the purchase line it is the selling of.
 *
 * The price has to be asked for, which is why it is a parameter. Nothing in
 * the data knows what a restaurant charges for a bottle it has only ever
 * bought, and a product created at zero would sit on the Ementa showing a
 * margin of minus its own cost until somebody noticed.
 */
export async function sellAsBought(input: {
  ingredientId: string;
  priceGross: number;
  vatRate: number;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const price = num(input.priceGross);
  if (price === null || price < 0) return fail('menuCalc.errPriceInvalid');

  const vat = num(input.vatRate);
  if (vat === null || vat < 0 || vat > 100) return fail('menuCalc.errVatInvalid');

  const ingredient = await prisma.ingredient.findFirst({
    where: { id: input.ingredientId, restaurantId: owner.restaurantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      soldAs: { where: { deletedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!ingredient) return fail('menuCalc.errIngredientNotFound');

  // Already sold as itself. Dropping it where it already is is a no-op, not
  // a reason to grow a second menu item with the same name.
  if (ingredient.soldAs.length > 0) return { success: true as const };

  // A name already on the board would give the owner two rows he cannot tell
  // apart, which is the thing disambiguation exists to prevent on import.
  const clash = await prisma.menuItem.findFirst({
    where: {
      restaurantId: owner.restaurantId,
      deletedAt: null,
      name: { equals: ingredient.name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (clash) return fail('menuCalc.errNameOnMenu');

  const count = await prisma.menuItem.count({
    where: { restaurantId: owner.restaurantId, deletedAt: null },
  });

  await prisma.menuItem.create({
    data: {
      restaurant: { connect: { id: owner.restaurantId } },
      name: ingredient.name,
      priceGross: price,
      vatRate: vat,
      sortOrder: count,
      costingMode: 'PURCHASE',
      purchaseItem: { connect: { id: ingredient.id } },
    },
  });

  return { success: true as const };
}

/**
 * Stops selling something as itself, leaving the purchase line behind.
 *
 * The other direction of the same drag, and the one that loses something: the
 * menu item carried the selling price, the VAT and the margin, and they go
 * with it. What stays is the thing the restaurant buys -- with its cost, its
 * price history and whatever invoice lines the owner has already answered for
 * -- because that is what makes it an ingredient a recipe can use.
 */
export async function stopSellingAsBought(ingredientId: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const ingredient = await prisma.ingredient.findFirst({
    where: { id: ingredientId, restaurantId: owner.restaurantId, deletedAt: null },
    select: {
      id: true,
      soldAs: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  if (!ingredient) return fail('menuCalc.errIngredientNotFound');
  if (ingredient.soldAs.length === 0) return { success: true as const };

  const now = new Date();
  await prisma.menuItem.updateMany({
    where: { id: { in: ingredient.soldAs.map((m) => m.id) } },
    data: { deletedAt: now, active: false },
  });

  return { success: true as const };
}
// ── Menu items ─────────────────────────────────────────────────────────────

export async function saveMenuItem(input: {
  id?: string;
  name: string;
  category?: string | null;
  priceGross: number;
  vatRate: number;
  monthlyVolume?: number | null;
  /**
   * How this is costed. Omitted leaves it as it was, so a dialog that does
   * not offer the choice cannot silently reset it.
   */
  costingMode?: 'RECIPE' | 'PURCHASE';
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const name = input.name?.trim();
  if (!name) return fail('O nome é obrigatório');

  const price = num(input.priceGross);
  if (price === null || price < 0) return fail('Preço inválido');

  const vat = num(input.vatRate);
  if (vat === null || vat < 0 || vat > 100) return fail('Taxa de IVA inválida');

  const volume =
    input.monthlyVolume === null || input.monthlyVolume === undefined
      ? null
      : Math.max(0, Math.round(num(input.monthlyVolume) ?? 0));

  const data = {
    name,
    category: input.category?.trim() || null,
    priceGross: price,
    vatRate: vat,
    monthlyVolume: volume,
    // Answering the question settles it, whichever way the owner answered:
    // the row was flagged because we could not tell, and now we have been told.
    ...(input.costingMode ? { costingMode: input.costingMode, needsReview: false } : {}),
  };

  if (input.id) {
    const existing = await prisma.menuItem.findFirst({
      where: { id: input.id, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return fail('Prato não encontrado');
    await prisma.menuItem.update({ where: { id: input.id }, data });
    return { success: true as const, data: { id: input.id } };
  }

  const count = await prisma.menuItem.count({
    where: { restaurantId: owner.restaurantId, deletedAt: null },
  });

  const created = await prisma.menuItem.create({
    data: { ...data, restaurantId: owner.restaurantId, sortOrder: count },
  });
  return { success: true as const, data: { id: created.id } };
}

export async function deleteMenuItem(id: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const existing = await prisma.menuItem.findFirst({
    where: { id, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true, costingMode: true, purchaseItemId: true },
  });
  if (!existing) return fail('menuCalc.errDishNotFound');

  const now = new Date();

  // A resale item's purchase line exists only to cost it, so taking the drink
  // off the board takes the bottle with it -- otherwise Preços slowly fills
  // with bottles for drinks nobody sells any more, which is the mess this
  // whole thing was meant to end.
  //
  // Soft, and only when no recipe borrowed it in the meantime: the invoice
  // links hang off that row and the owner's answer to "what is this line on
  // my invoice" has to outlive a menu change.
  const orphan =
    existing.costingMode === 'PURCHASE' && existing.purchaseItemId
      ? await prisma.recipeLine.count({ where: { ingredientId: existing.purchaseItemId } })
      : null;

  await prisma.$transaction([
    prisma.menuItem.update({ where: { id }, data: { deletedAt: now, active: false } }),
    ...(orphan === 0 && existing.purchaseItemId
      ? [
          prisma.ingredient.update({
            where: { id: existing.purchaseItemId },
            data: { deletedAt: now },
          }),
        ]
      : []),
  ]);
  return { success: true as const };
}

// ── Recipe lines ───────────────────────────────────────────────────────────

export async function setRecipeLine(input: {
  menuItemId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
}) {
  return addIngredientToItems({
    menuItemIds: [input.menuItemId],
    ingredientId: input.ingredientId,
    quantity: input.quantity,
    unit: input.unit,
  });
}

/**
 * Puts one ingredient into several dishes at once — the bun that goes into
 * every burger, the cup that goes with every drink. A dish that already has
 * the ingredient takes the new quantity, so the same action also corrects it
 * across the menu.
 */
export async function addIngredientToItems(input: {
  menuItemIds: string[];
  ingredientId: string;
  quantity: number;
  unit: string;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const ids = Array.from(new Set(input.menuItemIds)).slice(0, 500);
  if (ids.length === 0) return fail('menuCalc.errNoDishes');

  const quantity = num(input.quantity);
  if (quantity === null || quantity <= 0) return fail('menuCalc.errQuantity');
  if (!(RECIPE_UNITS as readonly string[]).includes(input.unit)) return fail('menuCalc.errUnit');

  // Both sides checked against this restaurant: a guessed uuid from another
  // restaurant must not become a line in this one's recipe.
  const [items, ingredient] = await Promise.all([
    prisma.menuItem.findMany({
      where: { id: { in: ids }, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true, _count: { select: { recipeLines: true } } },
    }),
    prisma.ingredient.findFirst({
      where: { id: input.ingredientId, restaurantId: owner.restaurantId, deletedAt: null },
      select: {
        id: true,
        soldAs: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      },
    }),
  ]);
  if (items.length !== ids.length) return fail('menuCalc.errDishNotFound');
  if (!ingredient) return fail('menuCalc.errIngredientNotFound');

  // A bottle of Super Bock is not an ingredient of a burger. It exists to cost
  // the drink that is sold as it, and letting it into another recipe would let
  // the owner rebuild by hand exactly the confusion this was meant to clear.
  if (ingredient.soldAs.length > 0) return fail('menuCalc.errPurchaseIngredient');

  await prisma.$transaction(
    items.map((item) =>
      prisma.recipeLine.upsert({
        where: {
          menuItemId_ingredientId: { menuItemId: item.id, ingredientId: ingredient.id },
        },
        create: {
          menuItemId: item.id,
          ingredientId: ingredient.id,
          quantity,
          unit: input.unit,
          sortOrder: item._count.recipeLines,
        },
        update: { quantity, unit: input.unit },
      })
    )
  );

  return { success: true as const, data: { count: items.length } };
}

export async function removeRecipeLine(menuItemId: string, ingredientId: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!item) return fail('menuCalc.errDishNotFound');

  await prisma.recipeLine.deleteMany({ where: { menuItemId, ingredientId } });
  return { success: true as const };
}
