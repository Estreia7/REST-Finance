'use server';

import { prisma } from '@/lib/prisma';
import { notWholeInvoice } from '@/lib/whole-invoice';
import { cheapestToDate } from '@/lib/price-increases';
import { normalizeProductName } from '@/lib/price-tracking';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { summarizePurchases, productDetail, type PurchaseLine } from '@/lib/purchased-products';

/**
 * Products bought, read from the invoice lines.
 *
 * Reading only. A line whose invoice was deleted is left out, as everywhere
 * else in Accounting: it is not a purchase the owner still has.
 */

const select = {
  id: true,
  normalizedName: true,
  productName: true,
  unit: true,
  quantity: true,
  unitPrice: true,
  totalPrice: true,
  invoiceDate: true,
  invoiceNumber: true,
  vendor: { select: { id: true, name: true } },
} as const;

const notDeleted = { OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] };

type Row = {
  id: string;
  normalizedName: string;
  productName: string;
  unit: string | null;
  quantity: unknown;
  unitPrice: unknown;
  totalPrice: unknown;
  invoiceDate: Date | null;
  invoiceNumber: string | null;
  vendor: { id: string; name: string } | null;
};

const toLine = (r: Row): PurchaseLine => ({
  id: r.id,
  normalizedName: r.normalizedName,
  productName: r.productName,
  unit: r.unit,
  quantity: Number(r.quantity),
  unitPrice: Number(r.unitPrice),
  total: Number(r.totalPrice),
  date: r.invoiceDate ? r.invoiceDate.toISOString().slice(0, 10) : null,
  invoiceNumber: r.invoiceNumber,
  vendorId: r.vendor?.id ?? null,
  vendorName: r.vendor?.name ?? null,
});

/** Every product bought, biggest spend first. */
export async function getPurchasedProducts() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const rows = await prisma.invoiceItem.findMany({
      // A discount is money off, not a product bought.
      where: { restaurantId: owner.restaurantId, totalPrice: { gte: 0 }, AND: [notDeleted, notWholeInvoice] },
      select,
    });

    return { success: true as const, data: summarizePurchases(rows.map(toLine)) };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the products bought', error, 'read') };
  }
}

/**
 * One product: spend, price range, price over time, and every purchase,
 * from whichever supplier.
 */
export async function getPurchasedProduct(normalizedName: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const name = normalizedName.trim();
    if (!name) return { error: 'errors.read' };

    const rows = await prisma.invoiceItem.findMany({
      where: { restaurantId: owner.restaurantId, normalizedName: name, AND: [notDeleted] },
      select,
    });
    const detail = productDetail(rows.map(toLine));
    if (!detail) return { error: 'errors.read' };

    // What the kitchen calls it, where a wording was identified as an
    // ingredient: the link between what was bought and what it costs a dish.
    const wordings = [...new Set(rows.map((r) => r.productName.trim().toLowerCase()))];
    const links = await prisma.invoiceItemLink.findMany({
      where: { restaurantId: owner.restaurantId, sourceName: { in: wordings }, ingredient: { deletedAt: null } },
      select: { ingredient: { select: { name: true } } },
    });
    const ingredients = [...new Set(links.map((l) => l.ingredient.name))];

    // The same thing from anyone: two suppliers word it differently, and it is
    // the ingredient they both feed that says they are the same.
    const linkedIds = await prisma.invoiceItemLink.findMany({
      where: { restaurantId: owner.restaurantId, sourceName: { in: wordings } },
      select: { ingredientId: true },
    });
    const related = await prisma.invoiceItemLink.findMany({
      where: { restaurantId: owner.restaurantId, ingredientId: { in: linkedIds.map((l) => l.ingredientId) } },
      select: { sourceName: true },
    });
    const names = [...new Set([name, ...related.map((r) => normalizeProductName(r.sourceName))])];
    const offers = await prisma.invoiceItem.findMany({
      where: { restaurantId: owner.restaurantId, normalizedName: { in: names }, AND: [notDeleted] },
      select: {
        productName: true, normalizedName: true, vendorId: true, unit: true, unitPrice: true, invoiceDate: true,
        vendor: { select: { name: true } },
      },
    });
    const cheapest = cheapestToDate(offers.map((o) => ({
      productName: o.productName,
      normalizedName: o.normalizedName,
      vendorId: o.vendorId,
      vendorName: o.vendor?.name ?? null,
      unit: o.unit,
      unitPrice: Number(o.unitPrice),
      date: o.invoiceDate ? o.invoiceDate.toISOString().slice(0, 10) : null,
    })), detail.unit);

    return { success: true as const, data: { ...detail, ingredients, cheapest } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the product', error, 'read') };
  }
}
