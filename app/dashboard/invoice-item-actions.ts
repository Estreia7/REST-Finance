'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(kg|l|lt|un|unid|cx|caixa|pç|pc|dz|g|ml)\s*$/i, '')
    .trim();
}

interface InvoiceItemInput {
  productName: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
}

export async function createInvoiceItems(
  costEntryId: string,
  vendorId: string | null,
  receiptScanId: string | null,
  invoiceDate: Date,
  invoiceNumber: string | null,
  items: InvoiceItemInput[]
) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  if (!items.length) return { success: false as const, error: 'Nenhum item fornecido' };

  const created = await prisma.invoiceItem.createMany({
    data: items.map((item) => ({
      restaurantId: owner.restaurantId,
      costEntryId,
      vendorId,
      receiptScanId,
      productName: item.productName.trim(),
      normalizedName: normalizeProductName(item.productName),
      quantity: item.quantity,
      unit: item.unit || null,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      invoiceDate,
      invoiceNumber,
    })),
  });

  return { success: true as const, count: created.count };
}

export async function getInvoiceItemsForEntry(costEntryId: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const items = await prisma.invoiceItem.findMany({
    where: { costEntryId, restaurantId: owner.restaurantId },
    include: { vendor: { select: { name: true } } },
    orderBy: { productName: 'asc' },
  });

  return { success: true as const, data: items };
}

export async function getItemPriceHistory(
  productName: string,
  vendorId?: string,
  limit: number = 50
) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return { success: false as const, error: owner.error };

  const normalized = normalizeProductName(productName);

  const items = await prisma.invoiceItem.findMany({
    where: {
      restaurantId: owner.restaurantId,
      normalizedName: normalized,
      ...(vendorId ? { vendorId } : {}),
    },
    include: { vendor: { select: { name: true } } },
    orderBy: { invoiceDate: 'asc' },
    take: limit,
  });

  return { success: true as const, data: items };
}
