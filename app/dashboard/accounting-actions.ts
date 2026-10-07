'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';

/**
 * The paperwork side of the business.
 *
 * Everything scanned ends up here: which supplier, what was bought, at what
 * price, on which invoice. It is the screen an owner opens when the
 * accountant asks a question, and the one they search when they want to know
 * what they paid for beef in March.
 *
 * Reading only — the records are written when an invoice is scanned.
 */

export interface InvoiceRow {
  id: string;
  productName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalPrice: number;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  vendorName: string | null;
  vendorId: string | null;
  /** The kitchen ingredient this line was identified as, if any. */
  ingredientName: string | null;
}

export interface AccountingSummary {
  rows: InvoiceRow[];
  /** How many rows matched, before the page limit. */
  total: number;
  vendors: Array<{ id: string; name: string; lines: number; spend: number }>;
  /** Lines nobody has said what they are. The work left to do. */
  unlinked: number;
}

/**
 * How many lines come back at once.
 *
 * Fifteen: enough that the recent invoices are all there without asking,
 * few enough that the page is a page rather than a scroll. More arrive on
 * request, newest first throughout, since what was bought last week is
 * what someone is looking for.
 */
const PAGE_SIZE = 15;

/**
 * Invoice lines, filtered.
 *
 * Search covers the product and the invoice number, because those are the two
 * things someone arrives knowing: "what did I pay for the mince" and "find me
 * invoice FR A25/3218".
 */
export async function getInvoiceLines(filters: {
  search?: string;
  vendorId?: string;
  from?: string;
  to?: string;
  /** Only lines not yet identified as an ingredient. */
  unlinkedOnly?: boolean;
  page?: number;
} = {}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const search = filters.search?.trim();
    const page = Math.max(0, Math.trunc(filters.page ?? 0));

    const where = {
      restaurantId: owner.restaurantId,
      // A line whose cost entry was deleted is not paperwork the owner
      // still has: deleting a cost used to leave its lines behind, so the
      // books showed one invoice and Accounting showed two. Lines with no
      // cost entry at all are kept — those came from somewhere else.
      //
      // Under AND, not OR: the search below adds its own OR, and two OR
      // keys in one object means the second silently replaces the first —
      // so a search would have brought the deleted lines back.
      AND: [{ OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] }],
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.from || filters.to
        ? {
            invoiceDate: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { productName: { contains: search, mode: 'insensitive' as const } },
              { invoiceNumber: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total, vendorGroups, links] = await Promise.all([
      prisma.invoiceItem.findMany({
        where,
        select: {
          id: true,
          productName: true,
          normalizedName: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalPrice: true,
          invoiceDate: true,
          invoiceNumber: true,
          vendor: { select: { id: true, name: true } },
        },
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
        // Everything up to the current page rather than one page of it:
        // "show more" should add to the list, not replace it.
        take: PAGE_SIZE * (page + 1),
      }),
      prisma.invoiceItem.count({ where }),
      prisma.invoiceItem.groupBy({
        by: ['vendorId'],
        where: { restaurantId: owner.restaurantId },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      // What each wording was identified as, so a line can say so without a
      // join per row.
      prisma.invoiceItemLink.findMany({
        where: { restaurantId: owner.restaurantId },
        select: { sourceName: true, ingredient: { select: { name: true } } },
      }),
    ]);

    const identifiedAs = new Map<string, string>();
    for (const link of links) {
      const existing = identifiedAs.get(link.sourceName);
      // Several ingredients can share a wording — a case of meat feeding the
      // burger and the extra portion. Named together rather than one picked.
      identifiedAs.set(
        link.sourceName,
        existing ? `${existing}, ${link.ingredient.name}` : link.ingredient.name,
      );
    }

    const vendorNames = await prisma.vendor.findMany({
      where: { restaurantId: owner.restaurantId },
      select: { id: true, name: true },
    });
    const vendorById = new Map(vendorNames.map((v) => [v.id, v.name]));

    const mapped: InvoiceRow[] = rows.map((row) => ({
      id: row.id,
      productName: row.productName,
      quantity: Number(row.quantity),
      unit: row.unit,
      unitPrice: Number(row.unitPrice),
      totalPrice: Number(row.totalPrice),
      invoiceDate: row.invoiceDate ? row.invoiceDate.toISOString().slice(0, 10) : null,
      invoiceNumber: row.invoiceNumber,
      vendorName: row.vendor?.name ?? null,
      vendorId: row.vendor?.id ?? null,
      ingredientName: identifiedAs.get(row.productName.trim().toLowerCase()) ?? null,
    }));

    const filtered = filters.unlinkedOnly
      ? mapped.filter((r) => r.ingredientName === null)
      : mapped;

    return {
      success: true,
      data: {
        rows: filtered,
        total,
        vendors: vendorGroups
          .filter((g) => g.vendorId)
          .map((g) => ({
            id: g.vendorId!,
            name: vendorById.get(g.vendorId!) ?? '—',
            lines: g._count._all,
            spend: Number(g._sum.totalPrice ?? 0),
          }))
          .sort((a, b) => b.spend - a.spend),
        unlinked: mapped.filter((r) => r.ingredientName === null).length,
      } satisfies AccountingSummary,
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the invoice lines', error, 'read') };
  }
}

/**
 * What one product has cost over time, newest first.
 *
 * The question behind "is my supplier putting prices up": the same product,
 * every invoice it appeared on, at what price each time.
 */
export async function getProductPriceHistory(normalizedName: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (!normalizedName.trim()) return { error: 'errors.read' };

    const rows = await prisma.invoiceItem.findMany({
      where: { restaurantId: owner.restaurantId, normalizedName: normalizedName.trim() },
      select: {
        unitPrice: true,
        quantity: true,
        invoiceDate: true,
        invoiceNumber: true,
        vendor: { select: { name: true } },
      },
      orderBy: { invoiceDate: 'desc' },
      take: 50,
    });

    return {
      success: true,
      data: rows.map((r) => ({
        unitPrice: Number(r.unitPrice),
        quantity: Number(r.quantity),
        date: r.invoiceDate ? r.invoiceDate.toISOString().slice(0, 10) : null,
        invoiceNumber: r.invoiceNumber,
        vendorName: r.vendor?.name ?? null,
      })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the price history', error, 'read') };
  }
}

/**
 * Suppliers that are one company written several ways.
 *
 * A NIF is the company; a name is however the reader read the letterhead that
 * day. One butcher arrived as four suppliers — "Profunda Origem", "PROFUNDA
 * ORIGEM", and two longer spellings — each with its own price history, so no
 * comparison between them was possible and the same invoice could be entered
 * once under each.
 *
 * New invoices no longer do this, because the supplier is matched on its tax
 * number first. This finds the ones already on file.
 */
export async function getDuplicateVendors() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const vendors = await prisma.vendor.findMany({
      where: { restaurantId: owner.restaurantId },
      select: {
        id: true,
        name: true,
        taxId: true,
        _count: { select: { invoiceItems: true, costEntries: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Grouped by tax number, which is the only reliable identity. Suppliers
    // with no NIF on file are left alone: two different butchers can have
    // similar names, and merging those would be worse than leaving them.
    const byTax = new Map<string, typeof vendors>();
    for (const vendor of vendors) {
      const nif = vendor.taxId?.replace(/\D/g, '');
      if (!nif) continue;
      byTax.set(nif, [...(byTax.get(nif) ?? []), vendor]);
    }

    // A supplier with no NIF on file, whose name matches one that has
    // a NIF, is almost always the same company read less well — the tax
    // number is near the top of an invoice and the easiest thing to miss
    // on a poor photograph. Grouped with it rather than left orphaned,
    // since otherwise the only duplicates that can ever be tidied are the
    // ones where both readings already worked.
    for (const vendor of vendors) {
      if (vendor.taxId?.replace(/D/g, '')) continue;
      const key = simplify(vendor.name);
      if (!key) continue;
      for (const [nif, list] of byTax) {
        if (list.some((v) => simplify(v.name).startsWith(key) || key.startsWith(simplify(v.name)))) {
          byTax.set(nif, [...list, vendor]);
          break;
        }
      }
    }

    const groups = [...byTax.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([taxId, list]) => {
        // The one to keep must have the tax number, or the merged supplier
        // would lose the only reliable thing identifying it and the next
        // invoice would create a fifth row. After that, the fullest name:
        // a reading that got the registered name is the better reading.
        const keep = [...list].sort((a, b) => {
          const aNif = a.taxId ? 1 : 0;
          const bNif = b.taxId ? 1 : 0;
          return bNif - aNif || b.name.length - a.name.length;
        })[0];

        return {
          taxId,
          keep: { id: keep.id, name: keep.name },
          merge: list
            .filter((v) => v.id !== keep.id)
            .map((v) => ({
              id: v.id,
              name: v.name,
              lines: v._count.invoiceItems,
              costs: v._count.costEntries,
            })),
        };
      });

    return { success: true, data: groups };
  } catch (error: unknown) {
    return { error: toClientError('Failed to look for duplicate suppliers', error, 'read') };
  }
}

/**
 * Folds duplicate suppliers into one.
 *
 * Everything that pointed at the duplicates — invoice lines, cost entries,
 * remembered product links — is repointed, and the empty suppliers removed.
 * Nothing is deleted except the supplier rows themselves.
 */
export async function mergeVendors(input: { keepId: string; mergeIds: string[] }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (!input.mergeIds.length) return { error: 'accounting.noVendorsToMerge' };

    // Every id must be this restaurant's, or a forged one would move another
    // tenant's invoices onto this supplier.
    const ids = [input.keepId, ...input.mergeIds];
    const owned = await prisma.vendor.findMany({
      where: { id: { in: ids }, restaurantId: owner.restaurantId },
      select: { id: true },
    });
    if (owned.length !== ids.length) return { error: 'accounting.vendorNotFound' };

    const mergeIds = input.mergeIds.filter((id) => id !== input.keepId);
    if (!mergeIds.length) return { error: 'accounting.noVendorsToMerge' };

    const moved = await prisma.$transaction(async (tx) => {
      const items = await tx.invoiceItem.updateMany({
        where: { restaurantId: owner.restaurantId, vendorId: { in: mergeIds } },
        data: { vendorId: input.keepId },
      });
      const costs = await tx.costEntry.updateMany({
        where: { restaurantId: owner.restaurantId, vendorId: { in: mergeIds } },
        data: { vendorId: input.keepId },
      });

      // A remembered link belongs to a supplier's wording. Moved rather than
      // dropped, or the owner would be asked again about products they have
      // already identified. Conflicts are deleted: the kept supplier already
      // has that answer.
      const links = await tx.invoiceItemLink.findMany({
        where: { restaurantId: owner.restaurantId, vendorId: { in: mergeIds } },
        select: { id: true, sourceName: true, ingredientId: true },
      });
      for (const link of links) {
        const clash = await tx.invoiceItemLink.findFirst({
          where: {
            restaurantId: owner.restaurantId,
            vendorId: input.keepId,
            sourceName: link.sourceName,
            ingredientId: link.ingredientId,
          },
          select: { id: true },
        });
        if (clash) await tx.invoiceItemLink.delete({ where: { id: link.id } });
        else await tx.invoiceItemLink.update({ where: { id: link.id }, data: { vendorId: input.keepId } });
      }

      await tx.vendor.deleteMany({
        where: { id: { in: mergeIds }, restaurantId: owner.restaurantId },
      });

      return { items: items.count, costs: costs.count };
    });

    return {
      success: true,
      data: { merged: mergeIds.length, lines: moved.items, costs: moved.costs },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to merge suppliers', error, 'write') };
  }
}

/**
 * What one ingredient has cost, invoice by invoice.
 *
 * The question behind "is my supplier putting prices up", asked of a thing
 * the kitchen uses rather than of a line on a document. Matched through the
 * remembered links as well as the name, because "Carne Picada Novilho" and
 * "Carne Smash" are the same purchase and their history is one history.
 *
 * Each entry carries the invoice it came from, so the owner can go and look
 * at the paperwork rather than taking the figure on trust.
 */
export async function getIngredientPriceHistory(ingredientId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (!ingredientId.trim()) return { error: 'errors.read' };

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true, name: true, normalizedName: true, unit: true },
    });
    if (!ingredient) return { error: 'errors.read' };

    // Every supplier wording that was ever confirmed as this ingredient.
    const links = await prisma.invoiceItemLink.findMany({
      where: { restaurantId: owner.restaurantId, ingredientId },
      select: { sourceName: true },
    });

    const wordings = [...new Set(links.map((l) => l.sourceName))];

    const rows = await prisma.invoiceItem.findMany({
      where: {
        restaurantId: owner.restaurantId,
        // A price from an invoice the owner deleted is not a price they
        // paid, and it would sit in the history as if it were.
        AND: [{ OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] }],
        OR: [
          { normalizedName: ingredient.normalizedName },
          ...(wordings.length
            ? [{ productName: { in: wordings, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: {
        id: true,
        productName: true,
        unit: true,
        unitPrice: true,
        quantity: true,
        invoiceDate: true,
        invoiceNumber: true,
        vendor: { select: { id: true, name: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      take: 40,
    });

    return {
      success: true,
      data: {
        ingredient: { id: ingredient.id, name: ingredient.name, unit: ingredient.unit },
        entries: rows.map((r) => ({
          id: r.id,
          productName: r.productName,
          unitPrice: Number(r.unitPrice),
          unit: r.unit,
          quantity: Number(r.quantity),
          date: r.invoiceDate ? r.invoiceDate.toISOString().slice(0, 10) : null,
          invoiceNumber: r.invoiceNumber,
          vendorName: r.vendor?.name ?? null,
          vendorId: r.vendor?.id ?? null,
        })),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the price history', error, 'read') };
  }
}

/** A supplier name reduced to what identifies it, for loose matching. */
function simplify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // The legal form says nothing about which company it is.
    .replace(/(lda|ltda|sa|s.a|unipessoal|comercio|cash|carry|portugal)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The photograph behind an invoice.
 *
 * Matched on the document number, which is what both the scan's extracted
 * data and the saved lines carry. The link could have been a foreign key, but
 * the lines are written by the reconciliation screen long after the scan row
 * exists, and a number that is unique by law is a sturdier join than an id
 * threaded through three screens.
 */
export async function getInvoiceImage(invoiceNumber: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const number = invoiceNumber.trim();
    if (!number) return { error: 'errors.read' };

    // Newest first: an invoice photographed twice has the better picture last.
    const scans = await prisma.receiptScan.findMany({
      where: { restaurantId: owner.restaurantId, imageUrl: { not: '' } },
      select: { id: true, imageUrl: true, extractedData: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const match = scans.find((scan) => {
      const data = scan.extractedData as { invoiceNumber?: string } | null;
      return data?.invoiceNumber?.trim() === number;
    });

    if (!match) return { success: true, data: null };

    return {
      success: true,
      data: { imagePath: match.imageUrl, scannedAt: match.createdAt.toISOString() },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the invoice image', error, 'read') };
  }
}

/**
 * Removes an invoice and everything it fed.
 *
 * Deleting the paperwork while leaving its figures behind would be worse than
 * keeping both: the cost would stay in the P&L with nothing to check it
 * against, and an ingredient would keep a price from a document that no
 * longer exists. So the lines go, the cost entry goes, and any ingredient
 * priced from this invoice falls back to whatever the invoice before it said.
 *
 * The remembered product links stay. They are the owner's answer to "this
 * supplier's wording means my Carne Smash", which is still true however the
 * invoice that prompted it was handled.
 */
export async function deleteInvoice(invoiceNumber: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const number = invoiceNumber.trim();
    if (!number) return { error: 'errors.delete' };

    const lines = await prisma.invoiceItem.findMany({
      where: { restaurantId: owner.restaurantId, invoiceNumber: number },
      select: { id: true, costEntryId: true, normalizedName: true },
    });
    if (lines.length === 0) return { error: 'accounting.invoiceNotFound' };

    const costEntryIds = [...new Set(lines.map((l) => l.costEntryId).filter(Boolean))] as string[];
    const names = [...new Set(lines.map((l) => l.normalizedName))];

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({
        where: { restaurantId: owner.restaurantId, invoiceNumber: number },
      });

      if (costEntryIds.length > 0) {
        await tx.costEntry.updateMany({
          where: { id: { in: costEntryIds }, restaurantId: owner.restaurantId },
          data: { deletedAt: new Date() },
        });
      }
    });

    // Repriced after the deletion, from whatever invoice is now the newest.
    // An ingredient left holding a price from a deleted document would be a
    // margin computed on a purchase that did not happen.
    const repriced = await repriceIngredients(owner.restaurantId, names);

    return {
      success: true,
      data: { lines: lines.length, costs: costEntryIds.length, repriced },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to delete the invoice', error, 'delete') };
  }
}

/**
 * Points ingredients at their newest surviving invoice price.
 *
 * Only those taking their cost from invoices: a price the owner pinned by
 * hand is their decision and not ours to move.
 */
async function repriceIngredients(restaurantId: string, normalizedNames: string[]): Promise<number> {
  if (normalizedNames.length === 0) return 0;

  const ingredients = await prisma.ingredient.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      manualUnitCost: null,
      normalizedName: { in: normalizedNames },
    },
    select: { id: true, normalizedName: true },
  });

  let changed = 0;
  for (const ingredient of ingredients) {
    const newest = await prisma.invoiceItem.findFirst({
      where: {
        restaurantId,
        normalizedName: ingredient.normalizedName,
        costEntry: { deletedAt: null },
      },
      select: { unitPrice: true, invoiceDate: true },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    });

    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: newest
        ? { invoiceUnitCost: newest.unitPrice, invoiceCostAt: newest.invoiceDate }
        // Nothing left to price it from: cleared rather than left showing a
        // figure from a document that no longer exists.
        : { invoiceUnitCost: null, invoiceCostAt: null },
    });
    changed++;
  }

  return changed;
}
