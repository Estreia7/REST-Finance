'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { normalizeProductName } from '@/lib/price-tracking';
import { guessPurchaseUnit } from '@/lib/catalogue-import';
import {
  reconcileInvoice,
  lineArithmeticHolds,
  packConversion,
  impliedUnitPrice,
  type InvoiceLine,
  findAliasCandidates,
  type ReconciledLine,
} from '@/lib/invoice-matching';
import {
  guessLineCategory,
  lineKey,
  type CategoryOrigin,
  type CostCategory,
} from '@/lib/invoice-categories';
import { rebalanceInvoice } from '@/lib/invoice-split-server';
import { rememberLine } from '@/lib/invoice-memory-server';

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
    /**
     * Set when the line could be read two ways and only the owner knows
     * which: so many packages, or the weight they hold. Null when there is
     * nothing to decide.
     */
    packChoice: {
      packAmount: number;
      packUnit: string;
      asWeight: InvoiceLine;
    } | null;
    /**
     * The cost category this line most likely is, and how that was decided.
     * Only 'memory' is known; everything else is a suggestion.
     */
    category: { id: string | null; origin: CategoryOrigin };
    /** The owner said before that this wording is not a kitchen ingredient. */
    notIngredient: boolean;
  }>;
  /** Ingredients to choose from, for the lines that need an answer. */
  candidates: Array<{ id: string; name: string; unit: string }>;
  /** The restaurant's cost categories, to place each line in one. */
  categories: CostCategory[];
}

/** An invoice line as read, with the reader's guess at its category. */
export type ScannedLine = InvoiceLine & { category?: string };

/**
 * Reads the scan against what the restaurant already knows.
 *
 * Nothing is written. The owner sees what will be linked, what is being
 * asked, and what would be created, before any of it happens.
 */
export async function previewReconciliation(input: {
  vendorName: string;
  vendorTaxId?: string | null;
  lines: ScannedLine[];
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (!input.lines.length) return { error: 'reconcile.noLines' };

    const [ingredients, vendor, categoryRows, memories] = await Promise.all([
      prisma.ingredient.findMany({
        where: { restaurantId: owner.restaurantId, deletedAt: null },
        select: { id: true, name: true, unit: true },
      }),
      findVendor(owner.restaurantId, input.vendorName, input.vendorTaxId),
      prisma.category.findMany({
        where: { restaurantId: owner.restaurantId, isActive: true, type: { in: ['COGS', 'OPEX'] } },
        select: { id: true, name: true, type: true },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      // The whole memory, not just this supplier's: a wording answered for
      // one wholesaler is usually the same thing from another, and the
      // nearly-the-same match looks across all of them.
      prisma.invoiceLineMemory.findMany({
        where: { restaurantId: owner.restaurantId },
        select: { sourceName: true, vendorId: true, categoryId: true, notIngredient: true, confirmations: true },
      }),
    ]);
    const categories: CostCategory[] = categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as CostCategory['type'],
    }));
    const active = new Set(categories.map((c) => c.id));
    const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const readerSaid = new Map(
      input.lines.map((l) => [
        l.productName,
        l.category ? byName.get(l.category.trim().toLowerCase()) ?? null : null,
      ]),
    );

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

    // Restated in what the kitchen buys in. A 1 kg tub stored as "1 un"
    // is true and useless: a recipe measuring in grams cannot convert
    // grams to units, so the dish cannot be costed at all.
    //
    // Only the certain ones are applied here. Where a package is some
    // other size, both readings are arithmetically sound and the owner
    // is asked rather than guessed at.
    const conversions = input.lines.map((line) => packConversion(line));
    const lines = input.lines.map((line, i) => conversions[i]?.certain ?? line);

    const reconciled = reconcileInvoice(lines, ingredients, remembered);

    return {
      success: true,
      data: {
        vendorId: vendor?.id ?? null,
        vendorName: input.vendorName.trim(),
        lines: reconciled.map((line) => {
          // Matched back by name, since reconcileInvoice reorders by
          // what each line cost.
          const conversion = conversions.find(
            (c, i) => c && !c.certain && input.lines[i].productName === line.productName,
          );
          const guess = guessLineCategory(line.productName, {
            vendorId: vendor?.id ?? null,
            memories,
            active,
            readerCategoryId: readerSaid.get(line.productName) ?? null,
          });
          return {
            ...line,
            suspect: !lineArithmeticHolds(line),
            impliedUnitPrice: impliedUnitPrice(line),
            // Null unless the owner has a choice to make.
            packChoice: conversion
              ? {
                  packAmount: conversion.pack.amount,
                  packUnit: conversion.pack.unit,
                  asWeight: conversion.asWeight,
                }
              : null,
            category: { id: guess.categoryId, origin: guess.origin },
            // A line already linked to an ingredient is one, whatever was
            // remembered before the link was made.
            notIngredient: line.decision.kind !== 'linked' && guess.notIngredient === true,
          };
        }),
        candidates: ingredients,
        categories,
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
  /** The cost category the line belongs to. Null leaves it with the invoice's. */
  categoryId?: string | null;
  /**
   * How the category was arrived at: the owner picked it, the memory knew
   * it, or a suggestion was accepted as it stood.
   */
  categorySource?: 'OWNER' | 'MEMORY' | 'SUGGESTED';
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
  /** The supplier NIF, which identifies the company where the name does not. */
  vendorTaxId?: string | null;
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
      select: { id: true, categoryId: true },
    });
    if (!costEntry) return { error: 'reconcile.noCostEntry' };

    // Only this restaurant's categories, and only ones still in use: a forged
    // or stale id leaves the line with the invoice's category instead.
    const categoryRows = await prisma.category.findMany({
      where: { restaurantId: owner.restaurantId, isActive: true, type: { in: ['COGS', 'OPEX'] } },
      select: { id: true, type: true },
    });
    const categoryType = new Map(categoryRows.map((c) => [c.id, c.type]));
    const categoryOf = (line: LineResolution) =>
      line.categoryId && categoryType.has(line.categoryId) ? line.categoryId : null;
    // A running cost — cleaning, gas, a repair — is never a kitchen
    // ingredient, whatever the line was ticked as.
    const isRunningCost = (line: LineResolution) =>
      categoryType.get(categoryOf(line) ?? '') === 'OPEX';

    const vendor = await ensureVendor(owner.restaurantId, input.vendorName, input.vendorTaxId);
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
          invoiceNumber: input.invoiceNumber.trim(),
        },
        select: { id: true },
      });
      if (already) return { error: 'reconcile.alreadyImported' };
    }

    let linked = 0;
    let created = 0;

    for (const line of input.lines) {
      if (line.skip || isRunningCost(line)) continue;

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

    // Every line is kept, ingredient or not. A skipped line used to be
    // dropped, which was harmless while an invoice was one cost; now that
    // the money is shared out by what the lines are, the bleach has to be
    // there to carry its part of the total.
    const toWrite = input.lines;
    await prisma.$transaction(async (tx) => {
      await tx.costEntry.update({
        where: { id: costEntry.id },
        data: { vendorId: vendor.id },
      });

      if (toWrite.length > 0) {
        await tx.invoiceItem.createMany({
          data: toWrite.map((line) => {
            const chosen = categoryOf(line);
            return {
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
              // Nobody said: it stays with the invoice's category, and is
              // marked so that nothing is learned from it.
              categoryId: chosen ?? costEntry.categoryId,
              categorySource: chosen
                ? (line.categorySource ?? 'OWNER')
                : costEntry.categoryId ? 'INHERITED' as const : null,
            };
          }),
        });
      }

      // One cost per category, sharing out the invoice's total.
      await rebalanceInvoice(tx, {
        restaurantId: owner.restaurantId,
        costEntryId: costEntry.id,
        userId: owner.userId,
      });
    });

    // What every line turned out to be, so the next invoice carrying the
    // same wording is answered before anyone is asked.
    const learned = await rememberLines(
      owner.restaurantId,
      vendor.id,
      input.lines.map((line) => ({
        productName: line.productName,
        categoryId: categoryOf(line),
        notIngredient: !!line.skip || isRunningCost(line),
      })),
    );

    // The ingredients this invoice touched now have a newer price than the
    // one they were costed at, so the cached figure is refreshed rather than
    // left to drift until someone opens the menu.
    await refreshIngredientCosts(owner.restaurantId, input.lines);

    return {
      success: true,
      data: { itemsWritten: toWrite.length, linked, ingredientsCreated: created, learned },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the invoice lines', error, 'write') };
  }
}

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
async function ensureVendor(restaurantId: string, name: string, taxId?: string | null) {
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
async function findVendor(restaurantId: string, name: string, taxId?: string | null) {
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
 * Writes what each line turned out to be into the restaurant's memory.
 *
 * A line with no category is still remembered if the owner said it is not an
 * ingredient; one with neither teaches nothing and is left out. Returns how
 * many answers were learned or reinforced.
 */
async function rememberLines(
  restaurantId: string,
  vendorId: string,
  lines: Array<{ productName: string; categoryId: string | null; notIngredient: boolean }>,
): Promise<number> {
  let learned = 0;
  const seen = new Set<string>();
  for (const line of lines) {
    const sourceName = lineKey(line.productName);
    // The same wording twice on one invoice is one answer, not two.
    if (!sourceName || seen.has(sourceName)) continue;
    seen.add(sourceName);
    if (!line.categoryId && !line.notIngredient) continue;

    await rememberLine(restaurantId, vendorId, sourceName, line.categoryId, line.notIngredient);
    learned++;
  }
  return learned;
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

/**
 * Whether this invoice is already recorded.
 *
 * Asked before anything is written, because the guard inside
 * `commitReconciliation` runs after the cost entry exists — so a second scan
 * of the same invoice was refused its lines and kept its money, which is the
 * worse half to duplicate.
 *
 * Matched on the document number, which a Portuguese supplier may not reuse.
 * Without one there is nothing reliable to match on and the scan goes
 * through: refusing on a date and a total would reject the second of two
 * genuine deliveries on the same day.
 */
export async function findExistingInvoice(input: {
  vendorName: string;
  invoiceNumber: string | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const number = input.invoiceNumber?.trim();
    if (!number) return { success: true, data: null };

    // The document number alone, not the number under that supplier. The
    // same invoice read twice can produce two spellings of one butcher, and
    // narrowing by supplier let it in a second time under the other
    // spelling — which is exactly what happened.
    const existing = await prisma.invoiceItem.findFirst({
      where: {
        restaurantId: owner.restaurantId,
        invoiceNumber: number,
      },
      select: {
        invoiceDate: true,
        costEntry: { select: { id: true, amount: true } },
        vendor: { select: { name: true } },
      },
    });

    if (!existing) return { success: true, data: null };

    // An invoice shared out between categories is several costs; the owner
    // recognises the document by its total, not by one category's share.
    let amount = existing.costEntry ? Number(existing.costEntry.amount) : null;
    if (existing.costEntry) {
      const parts = await prisma.costEntry.findMany({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          invoiceItems: { some: { invoiceNumber: number } },
        },
        select: { amount: true },
      });
      if (parts.length > 1) {
        amount = Math.round(parts.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
      }
    }

    return {
      success: true,
      data: {
        invoiceNumber: number,
        vendorName: existing.vendor?.name ?? input.vendorName,
        date: existing.invoiceDate ? existing.invoiceDate.toISOString().slice(0, 10) : null,
        amount,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to check for a duplicate', error, 'read') };
  }
}
