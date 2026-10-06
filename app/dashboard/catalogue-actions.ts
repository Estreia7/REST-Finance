'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { normalizeProductName } from '@/lib/price-tracking';
import {
  planCatalogue,
  guessPurchaseUnit,
  type CatalogueProduct,
  type ClassifiedProduct,
} from '@/lib/catalogue-import';

/**
 * Filling the Ementa and Preços from the till's own catalogue.
 *
 * Everything needed to cost a menu is already built — recipes, ingredients,
 * units, costs read off the invoices. It sits empty because the only way in
 * is typing two hundred products by hand, so nobody ever starts.
 *
 * The POS import already knows those two hundred, what they sell for, and
 * which family each belongs to. This reads them across: dishes to the Ementa
 * with their real price, ingredients to Preços with a unit to buy in.
 *
 * It never invents a recipe. A dish arrives priced and empty, and the owner
 * says what goes in it — the part only they know.
 */

/** What the preview shows and the import writes. */
export interface CataloguePreview {
  dishes: ClassifiedProduct[];
  ingredients: ClassifiedProduct[];
  skipped: ClassifiedProduct[];
  /** Already on the menu, so a second run adds rather than duplicates. */
  existingMenuItems: number;
  existingIngredients: number;
}

async function readCatalogue(restaurantId: string): Promise<CatalogueProduct[]> {
  const rows = await prisma.posProduct.findMany({
    where: { restaurantId },
    select: {
      id: true,
      code: true,
      name: true,
      subFamily: true,
      category: { select: { name: true } },
      sales: { select: { quantity: true, revenue: true } },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    familia: p.category?.name ?? null,
    subFamily: p.subFamily,
    quantity: p.sales.reduce((s, x) => s + x.quantity, 0),
    revenue: p.sales.reduce((s, x) => s + x.revenue.toNumber(), 0),
  }));
}

/**
 * What the import would do, without doing any of it.
 *
 * Two hundred rows written into someone's menu unannounced is not something
 * to undo by hand, so the owner sees the split and the reasons first.
 */
export async function previewCatalogueImport() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const [products, menuCount, ingredientCount] = await Promise.all([
      readCatalogue(owner.restaurantId),
      prisma.menuItem.count({ where: { restaurantId: owner.restaurantId, deletedAt: null } }),
      prisma.ingredient.count({ where: { restaurantId: owner.restaurantId, deletedAt: null } }),
    ]);

    if (products.length === 0) return { error: 'catalogue.noProducts' };

    const plan = planCatalogue(products);

    return {
      success: true,
      data: {
        ...plan,
        existingMenuItems: menuCount,
        existingIngredients: ingredientCount,
      } satisfies CataloguePreview,
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the catalogue', error, 'read') };
  }
}

/**
 * Writes the plan.
 *
 * Matched on name, so running it again after a new POS import adds what is
 * new and leaves alone what the owner has since edited: a dish whose price
 * they corrected by hand must not be overwritten by the till's average.
 */
export async function commitCatalogueImport() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const products = await readCatalogue(owner.restaurantId);
    if (products.length === 0) return { error: 'catalogue.noProducts' };

    const plan = planCatalogue(products);

    const [existingItems, existingIngredients] = await Promise.all([
      prisma.menuItem.findMany({
        where: { restaurantId: owner.restaurantId, deletedAt: null },
        select: { name: true },
      }),
      prisma.ingredient.findMany({
        where: { restaurantId: owner.restaurantId, deletedAt: null },
        select: { name: true },
      }),
    ]);

    const haveItem = new Set(existingItems.map((i) => i.name.trim().toUpperCase()));
    const haveIngredient = new Set(existingIngredients.map((i) => i.name.trim().toUpperCase()));

    const newDishes = plan.dishes.filter((d) => !haveItem.has(d.menuName.trim().toUpperCase()));
    const newIngredients = plan.ingredients.filter(
      (i) => !haveIngredient.has(i.menuName.trim().toUpperCase()),
    );

    if (newDishes.length > 0) {
      await prisma.menuItem.createMany({
        data: newDishes.map((d, i) => ({
          restaurantId: owner.restaurantId,
          name: d.menuName,
          category: d.familia,
          priceGross: d.priceGross ?? 0,
          vatRate: d.vatRate,
          // What it sold over the imported period, which is what ranks a
          // dish by what it actually contributes rather than by its margin.
          monthlyVolume: d.quantity > 0 ? Math.max(1, Math.round(d.quantity / 12)) : null,
          sortOrder: i,
        })),
      });
    }

    if (newIngredients.length > 0) {
      await prisma.ingredient.createMany({
        data: newIngredients.map((ing) => ({
          restaurantId: owner.restaurantId,
          name: ing.menuName,
          // What the invoices are matched against. Left to the shared
          // normaliser so an ingredient and an invoice line agree on what
          // counts as the same name.
          normalizedName: normalizeProductName(ing.menuName),
          unit: guessPurchaseUnit(ing.name),
          // Deliberately null: the cost comes from the invoices, and a zero
          // here would read as "this is free" rather than "not known yet".
          manualUnitCost: null,
        })),
      });
    }

    return {
      success: true,
      data: {
        dishesCreated: newDishes.length,
        ingredientsCreated: newIngredients.length,
        dishesSkipped: plan.dishes.length - newDishes.length,
        ingredientsSkipped: plan.ingredients.length - newIngredients.length,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to import the catalogue', error, 'write') };
  }
}
