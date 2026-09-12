'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { normalizeProductName } from '@/lib/price-tracking';
import { costMenuItem, classify, type RecipeLineInput } from '@/lib/menu-costing';

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
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, deletedAt: null },
    select: { id: true, normalizedName: true, invoiceCostAt: true },
  });
  if (ingredients.length === 0) return;

  const latest = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      normalizedName: { in: ingredients.map((i) => i.normalizedName) },
    },
    orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    select: { normalizedName: true, unitPrice: true, invoiceDate: true, createdAt: true },
  });

  // First hit per name wins: the query is already ordered newest first.
  const newest = new Map<string, { price: number; at: Date }>();
  for (const item of latest) {
    if (newest.has(item.normalizedName)) continue;
    newest.set(item.normalizedName, {
      price: Number(item.unitPrice),
      at: item.invoiceDate ?? item.createdAt,
    });
  }

  const updates = ingredients
    .map((ing) => {
      const hit = newest.get(ing.normalizedName);
      if (!hit) return null;
      // Skip the write when nothing moved, so opening the menu is not a
      // write storm on a restaurant with a long ingredient list.
      if (ing.invoiceCostAt && ing.invoiceCostAt.getTime() === hit.at.getTime()) return null;
      return prisma.ingredient.update({
        where: { id: ing.id },
        data: { invoiceUnitCost: hit.price, invoiceCostAt: hit.at },
      });
    })
    .filter(Boolean);

  if (updates.length > 0) await prisma.$transaction(updates as never[]);
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
      },
    }),
    prisma.ingredient.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: { name: 'asc' },
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
    });

    return {
      id: item.id,
      name: item.name,
      category: item.category,
      priceGross: Number(item.priceGross),
      vatRate: Number(item.vatRate),
      monthlyVolume: item.monthlyVolume,
      active: item.active,
      costing,
    };
  });

  // Menu engineering compares a dish with the rest of the carte, so the
  // thresholds are this menu's own averages. Only dishes that are costed and
  // carry a volume take part: a dish with no recipe would drag the average
  // down and mislabel everything else.
  const rated = costed.filter((c) => !c.costing.incomplete && c.costing.lines.length > 0);
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

// ── Menu items ─────────────────────────────────────────────────────────────

export async function saveMenuItem(input: {
  id?: string;
  name: string;
  category?: string | null;
  priceGross: number;
  vatRate: number;
  monthlyVolume?: number | null;
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
    select: { id: true },
  });
  if (!existing) return fail('Prato não encontrado');

  await prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  return { success: true as const };
}

// ── Recipe lines ───────────────────────────────────────────────────────────

export async function setRecipeLine(input: {
  menuItemId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const quantity = num(input.quantity);
  if (quantity === null || quantity <= 0) return fail('Quantidade inválida');
  if (!['g', 'kg', 'ml', 'L', 'un'].includes(input.unit)) return fail('Unidade inválida');

  // Both sides checked against this restaurant: a guessed uuid from another
  // restaurant must not become a line in this one's recipe.
  const [item, ingredient] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id: input.menuItemId, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    }),
    prisma.ingredient.findFirst({
      where: { id: input.ingredientId, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!item) return fail('Prato não encontrado');
  if (!ingredient) return fail('Ingrediente não encontrado');

  const count = await prisma.recipeLine.count({ where: { menuItemId: input.menuItemId } });

  await prisma.recipeLine.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: input.menuItemId,
        ingredientId: input.ingredientId,
      },
    },
    create: {
      menuItemId: input.menuItemId,
      ingredientId: input.ingredientId,
      quantity,
      unit: input.unit,
      sortOrder: count,
    },
    update: { quantity, unit: input.unit },
  });

  return { success: true as const };
}

export async function removeRecipeLine(menuItemId: string, ingredientId: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!item) return fail('Prato não encontrado');

  await prisma.recipeLine.deleteMany({ where: { menuItemId, ingredientId } });
  return { success: true as const };
}
