'use server';

import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { detectPriceChanges, getProductPriceTimeline } from '@/lib/price-tracking';

export async function getPriceAlerts(thresholdPercent: number = 5) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const alerts = await detectPriceChanges(owner.restaurantId, thresholdPercent);

  return { success: true as const, data: alerts };
}

export async function getProductPriceHistory(
  productName: string,
  vendorId?: string
) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const { normalizeProductName } = await import('@/lib/price-tracking');
  const normalized = normalizeProductName(productName);

  const items = await getProductPriceTimeline(owner.restaurantId, normalized, vendorId);

  const data = items.map(item => ({
    date: item.invoiceDate,
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    quantity: Number(item.quantity),
    vendor: item.vendor?.name || null,
    invoiceNumber: item.invoiceNumber,
  }));

  return { success: true as const, data };
}
