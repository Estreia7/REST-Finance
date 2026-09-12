'use server';

import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { invoiceItemSchema } from '@/lib/validations';

/** One invoice does not legitimately carry more lines than this. */
const MAX_ITEMS = 200;

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
  if (items.length > MAX_ITEMS) {
    return { success: false as const, error: `Máximo de ${MAX_ITEMS} artigos por fatura.` };
  }

  const parsed = z.array(invoiceItemSchema).safeParse(items);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.errors[0]?.message ?? 'Artigo inválido',
    };
  }

  // Every supplied id must belong to this restaurant. Stamping our own
  // restaurantId is not enough: without these checks a forged costEntryId
  // would attach line items to another tenant's cost entry.
  const costEntry = await prisma.costEntry.findFirst({
    where: { id: costEntryId, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!costEntry) {
    return { success: false as const, error: 'Lançamento não encontrado' };
  }

  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, restaurantId: owner.restaurantId },
      select: { id: true },
    });
    if (!vendor) return { success: false as const, error: 'Fornecedor não encontrado' };
  }

  if (receiptScanId) {
    const scan = await prisma.receiptScan.findFirst({
      where: { id: receiptScanId, restaurantId: owner.restaurantId },
      select: { id: true },
    });
    if (!scan) return { success: false as const, error: 'Digitalização não encontrada' };
  }

  const created = await prisma.invoiceItem.createMany({
    data: parsed.data.map((item) => ({
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
