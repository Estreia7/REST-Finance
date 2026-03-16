import { prisma } from '@/lib/prisma';

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

export interface PriceAlert {
  productName: string;
  normalizedName: string;
  vendorName: string | null;
  vendorId: string | null;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
  invoiceDate: Date | null;
}

/**
 * Detect price changes by comparing the latest invoice item unit price
 * to the average of all previous prices for the same product+vendor.
 */
export async function detectPriceChanges(
  restaurantId: string,
  thresholdPercent: number = 5,
  lookbackDays: number = 90
): Promise<PriceAlert[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  // Get all invoice items within the lookback period
  const items = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      invoiceDate: { gte: cutoff },
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { invoiceDate: 'asc' },
  });

  // Group by (normalizedName, vendorId)
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.normalizedName}::${item.vendorId || 'unknown'}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const alerts: PriceAlert[] = [];

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    const latest = group[group.length - 1];
    const previous = group.slice(0, -1);

    const avgPrevPrice = previous.reduce((sum, i) => sum + Number(i.unitPrice), 0) / previous.length;
    const currentPrice = Number(latest.unitPrice);

    if (avgPrevPrice === 0) continue;

    const changePercent = ((currentPrice - avgPrevPrice) / avgPrevPrice) * 100;

    if (Math.abs(changePercent) >= thresholdPercent) {
      alerts.push({
        productName: latest.productName,
        normalizedName: latest.normalizedName,
        vendorName: latest.vendor?.name || null,
        vendorId: latest.vendorId,
        previousPrice: avgPrevPrice,
        currentPrice,
        changePercent,
        invoiceDate: latest.invoiceDate,
      });
    }
  }

  // Sort by absolute change (biggest changes first)
  return alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
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
