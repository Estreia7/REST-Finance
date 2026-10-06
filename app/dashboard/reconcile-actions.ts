'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { normalizeProductName } from '@/lib/price-tracking';
import { guessPurchaseUnit } from '@/lib/catalogue-import';
import {
  reconcileInvoice,
  lineArithmeticHolds,
  impliedUnitPrice,
  type InvoiceLine,
  findAliasCandidates,
  type ReconciledLine,
} from '@/lib/invoice-matching';

/**
 * Turning a scanned invoice into facts the rest of the app can use.
 *
 * Until now a scan became one cost entry with its lines flattened into the
 * description — the money was right and everything else was thrown away. So
 * the price tracker had nothing to track, ingredient costs never moved, and
 * an owner scanning invoices every week got no more from it than one who
 * typed a total.
 *
 * Now each line is kept: the product, what was bought, what it cost per kilo,
 * and who sold it. Lines are matched to the ingredients the kitchen already
 * has, and the owner is asked only where the guess is not safe — once per
 * wording, never again.
 */

export interface ReconcilePreview {
  vendorId: string | null;
  vendorName: string;
  lines: Array<ReconciledLine & {
    /** quantity × unitPrice did not equal the total: something was misread. */
    suspect: boolean;
    /** What the unit price would be if the total and quantity are right. */
    impliedUnitPrice: number | null;
  }>;
  /** Ingredients to choose from, for the lines that need an answer. */
  candidates: Array<{ id: string; name: string; unit: string }>;
}

/**
 * Reads the scan against what the restaurant already knows.
 *
 * Nothing is written. The owner sees what will be linked, what is being
 * asked, and what would be created, before any of it happens.
 */
export async function previewReconciliation(input: {
  vendorName: string;
  lines: InvoiceLine[];
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (!input.lines.length) return { error: 'reconcile.noLines' };

    const [ingredients, vendor] = await Promise.all([
      prisma.ingredient.findMany({
        where: { restaurantId: owner.restaurantId, deletedAt: null },
        select: { id: true, name: true, unit: true },
      }),
      findVendor(owner.restaurantId, input.vendorName),
    ]);

    // What this supplier's wordings were already resolved to. Matched on the
    // wording alone as well as per supplier, so an owner who answered for one
    // wholesaler is not asked again for another selling the same thing.
    const links = await prisma.invoiceItemLink.findMany({
      where: {
        restaurantId: owner.restaurantId,
        OR: [{ vendorId: vendor?.id ?? null }, { vendorId: null }],
      },
      select: { sourceName: true, ingredientId: true, vendorId: true },
    });

    // Every ingredient confirmed for a wording, not just one: a case of
    // meat can feed both the burger mince and the extra portion.
    const remembered = new Map<string, string[]>();
    for (const link of links) {
      const list = remembered.get(link.sourceName) ?? [];
      if (!list.includes(link.ingredientId)) list.push(link.ingredientId);
      remembered.set(link.sourceName, list);
    }

    const reconciled = reconcileInvoice(input.lines, ingredients, remembered);

    return {
      success: true,
      data: {
        vendorId: vendor?.id ?? null,
        vendorName: input.vendorName.trim(),
        lines: reconciled.map((line) => ({
          ...line,
          suspect: !lineArithmeticHolds(line),
          impliedUnitPrice: impliedUnitPrice(line),
        })),
        candidates: ingredients,
      } satisfies ReconcilePreview,
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to reconcile the invoice', error, 'read') };
  }
}

/** What the owner decided for each line. */
export interface LineResolution {
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
  /**
   * The ingredients this line feeds. More than one where a single
   * purchase is used two ways — they share the price per kilo, being the
   * same product bought once.
   */
  ingredientIds?: string[];
  /** Or create one under this name. */
  createAs?: string;
  /** Or neither: keep the line, link nothing. */
  skip?: boolean;
}

/**
 * Writes the invoice: its lines, its links, and any new ingredients.
 *
 * The cost entry itself is created by the caller, since that is the part that
 * already worked. This attaches everything that was being discarded.
 */
export async function commitReconciliation(input: {
  costEntryId: string;
  vendorName: string;
  invoiceDate: string;
  invoiceNumber: string | null;
  lines: LineResolution[];
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    // The cost entry must be this restaurant's. Stamping our own id is not
    // enough — a forged one would hang invoice lines off another tenant's
    // entry.
    const costEntry = await prisma.costEntry.findFirst({
      where: { id: input.costEntryId, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!costEntry) return { error: 'reconcile.noCostEntry' };

    const vendor = await ensureVendor(owner.restaurantId, input.vendorName);
    const invoiceDate = new Date(input.invoiceDate);

    // The same invoice photographed twice, or a save that was pressed
    // twice, must not double the lines: an owner would see their beef
    // costed at twice the weight and the price history would show a
    // purchase that never happened. Matched on the document number, which
    // is unique per supplier by law.
    if (input.invoiceNumber?.trim()) {
      const already = await prisma.invoiceItem.findFirst({
        where: {
          restaurantId: owner.restaurantId,
          vendorId: vendor.id,
          invoiceNumber: input.invoiceNumber.trim(),
        },
        select: { id: true },
      });
      if (already) return { error: 'reconcile.alreadyImported' };
    }

    let linked = 0;
    let created = 0;

    for (const line of input.lines) {
      if (line.skip) continue;

      const ingredientIds = [...(line.ingredientIds ?? [])];

      if (ingredientIds.length === 0 && line.createAs?.trim()) {
        const name = line.createAs.trim();
        // Reused if the owner already has one by that name: two ingredients
        // called the same thing would split a cost history in half.
        const existing = await prisma.ingredient.findFirst({
          where: { restaurantId: owner.restaurantId, deletedAt: null, name },
          select: { id: true },
        });
        if (existing) {
          ingredientIds.push(existing.id);
        } else {
          const made = await prisma.ingredient.create({
            data: {
              restaurantId: owner.restaurantId,
              name,
              normalizedName: normalizeProductName(name),
              unit: line.unit?.trim() || guessPurchaseUnit(name),
            },
            select: { id: true },
          });
          ingredientIds.push(made.id);
          created++;
        }
      }

      for (const ingredientId of ingredientIds) {
        // Remembered against this supplier's wording, so the same line next
        // month asks nobody anything.
        await prisma.invoiceItemLink.upsert({
          where: {
            restaurantId_sourceName_vendorId_ingredientId: {
              restaurantId: owner.restaurantId,
              sourceName: line.productName.trim().toLowerCase(),
              vendorId: vendor.id,
              ingredientId,
            },
          },
          create: {
            restaurantId: owner.restaurantId,
            sourceName: line.productName.trim().toLowerCase(),
            vendorId: vendor.id,
            ingredientId,
          },
          update: { ingredientId },
        });
        linked++;
      }
    }

    const toWrite = input.lines.filter((l) => !l.skip);
    if (toWrite.length > 0) {
      await prisma.invoiceItem.createMany({
        data: toWrite.map((line) => ({
          restaurantId: owner.restaurantId,
          costEntryId: input.costEntryId,
          vendorId: vendor.id,
          productName: line.productName.trim(),
          normalizedName: normalizeProductName(line.productName),
          quantity: line.quantity,
          unit: line.unit?.trim() || null,
          unitPrice: line.unitPrice,
          totalPrice: line.total,
          invoiceDate,
          invoiceNumber: input.invoiceNumber,
        })),
      });
    }

    // The ingredients this invoice touched now have a newer price than the
    // one they were costed at, so the cached figure is refreshed rather than
    // left to drift until someone opens the menu.
    await refreshIngredientCosts(owner.restaurantId, input.lines);

    return {
      success: true,
      data: { itemsWritten: toWrite.length, linked, ingredientsCreated: created },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the invoice lines', error, 'write') };
  }
}

/** The supplier, matched on name or created. */
async function ensureVendor(restaurantId: string, name: string) {
  const trimmed = name.trim() || 'Fornecedor';
  const existing = await prisma.vendor.findFirst({
    where: { restaurantId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.vendor.create({
    data: { restaurantId, name: trimmed },
    select: { id: true },
  });
}

async function findVendor(restaurantId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return prisma.vendor.findFirst({
    where: { restaurantId, name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
}

/**
 * Points each touched ingredient at its newest invoice price.
 *
 * `invoiceUnitCost` is a cache, and a cache nobody refreshes is a stale
 * number presented as a current one. Only ingredients with no manual cost are
 * updated: a figure the owner pinned by hand is their decision, not ours to
 * overwrite because a supplier sent a different price.
 */
async function refreshIngredientCosts(restaurantId: string, lines: LineResolution[]) {
  const touched = [...new Set(lines.flatMap((l) => l.ingredientIds ?? []))];
  if (touched.length === 0) return;

  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: touched }, restaurantId, manualUnitCost: null },
    select: { id: true },
  });

  for (const ingredient of ingredients) {
    const line = lines.find((l) => l.ingredientIds?.includes(ingredient.id));
    if (!line || line.unitPrice <= 0) continue;
    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: { invoiceUnitCost: line.unitPrice, invoiceCostAt: new Date() },
    });
  }
}

/**
 * Ingredients that look like one thing counted twice.
 *
 * Nothing is changed: the pairs are proposed and the owner says which are
 * real. "EXTRA BACON" is the same as "BACON"; "EXTRA CHEDDAR" might be a
 * different cheese bought separately, and a wrong merge silently reprices
 * every dish using it.
 */
export async function getDuplicateIngredients() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const ingredients = await prisma.ingredient.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null, aliasOfId: null },
      select: { id: true, name: true, _count: { select: { recipeLines: true } } },
    });

    const candidates = findAliasCandidates(
      ingredients.map((i) => ({ id: i.id, name: i.name, recipeCount: i._count.recipeLines })),
    );

    return { success: true, data: candidates };
  } catch (error: unknown) {
    return { error: toClientError('Failed to look for duplicates', error, 'read') };
  }
}

/**
 * Makes one ingredient a portion of another.
 *
 * The alias keeps its name — it is what the till prints and what the
 * ingredients ranking counts — but its cost comes from the original, so an
 * invoice prices both at once and the two can never drift apart.
 */
export async function mergeIngredients(pairs: Array<{ duplicateId: string; originalId: string }>) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (!pairs.length) return { error: 'reconcile.noPairs' };

    // Both sides must be this restaurant's, or a forged id would attach one
    // tenant's ingredient to another's.
    const ids = [...new Set(pairs.flatMap((p) => [p.duplicateId, p.originalId]))];
    const owned = await prisma.ingredient.findMany({
      where: { id: { in: ids }, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((i) => i.id));

    let merged = 0;
    for (const pair of pairs) {
      if (!ownedIds.has(pair.duplicateId) || !ownedIds.has(pair.originalId)) continue;
      // An ingredient cannot be a portion of itself, and a chain of aliases
      // would make the cost lookup a loop.
      if (pair.duplicateId === pair.originalId) continue;

      const target = await prisma.ingredient.findUnique({
        where: { id: pair.originalId },
        select: { aliasOfId: true },
      });
      if (target?.aliasOfId) continue;

      await prisma.ingredient.update({
        where: { id: pair.duplicateId },
        data: { aliasOfId: pair.originalId },
      });
      merged++;
    }

    return { success: true, data: { merged } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to merge ingredients', error, 'write') };
  }
}
