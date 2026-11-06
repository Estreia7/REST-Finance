import { prisma } from '@/lib/prisma';
import { priceIncreases, type PriceIncrease } from '@/lib/price-increases';

/**
 * Normalize a product name for price comparison.
 * Removes unit suffixes, normalizes whitespace, lowercases.
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(kg|l|lt|un|unid|cx|caixa|pç|pc|dz|g|ml)\s*$/i, '')
    .trim();
}

/** Every product that has ever gone up. See lib/price-increases.ts. */
export async function detectPriceChanges(restaurantId: string): Promise<PriceIncrease[]> {
  const items = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      // Lines whose cost was deleted are not purchases the owner made.
      OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }],
    },
    select: {
      productName: true, normalizedName: true, vendorId: true, unit: true, unitPrice: true, invoiceDate: true,
      vendor: { select: { name: true } },
    },
  });
  return priceIncreases(items.map((i) => ({
    productName: i.productName,
    normalizedName: i.normalizedName,
    vendorId: i.vendorId,
    vendorName: i.vendor?.name ?? null,
    unit: i.unit,
    unitPrice: Number(i.unitPrice),
    date: i.invoiceDate ? i.invoiceDate.toISOString().slice(0, 10) : null,
  })));
}

/**
 * Get the price timeline for a specific product across all invoices.
 */
export async function getProductPriceTimeline(
  restaurantId: string,
  normalizedName: string,
  vendorId?: string,
  limit: number = 50
) {
  return prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      normalizedName,
      ...(vendorId ? { vendorId } : {}),
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { invoiceDate: 'asc' },
    take: limit,
  });
}
