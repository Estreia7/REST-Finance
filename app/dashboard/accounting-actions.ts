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

/** A page of rows; more than this on one screen is a scroll, not a search. */
const PAGE_SIZE = 100;

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
        take: PAGE_SIZE,
        skip: page * PAGE_SIZE,
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
