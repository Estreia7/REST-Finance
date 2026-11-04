'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { normalizeProductName } from '@/lib/price-tracking';
import { lineKey } from '@/lib/invoice-categories';
import { rememberedPack } from '@/lib/invoice-matching';
import { rebalanceInvoice } from '@/lib/invoice-split-server';
import { repriceIngredients } from '@/lib/ingredient-costs-server';
import { rereadStoredDocument } from '@/lib/scan-core';
import { restateLine } from '@/lib/line-setup';
import { checkReading, type Proof, type TaxTruth } from '@/lib/invoice-checks';

/**
 * Confirming an invoice whose lines do not add up.
 *
 * Most invoices prove themselves against their QR and nobody sees this. What
 * is left is shown beside its photograph, with what is still missing, and the
 * owner settles it. The money was already right: the total came from the QR.
 */

export interface ProofLine {
  /** Absent on a line that is not saved yet. */
  id?: string;
  productName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  vatRate: number | null;
}

export interface InvoiceForProof {
  invoiceNumber: string;
  vendorName: string | null;
  date: string | null;
  imagePath: string | null;
  grandTotal: number;
  truth: TaxTruth[];
  lines: ProofLine[];
}

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** The invoices waiting for the owner, most money adrift first. */
export async function getInvoicesToConfirm() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const scans = await prisma.receiptScan.findMany({
      where: {
        restaurantId: owner.restaurantId,
        proofStatus: 'failed',
        proofResolvedAt: null,
        linkedEntryId: { not: null },
      },
      select: { extractedData: true, linkedEntry: { select: { invoiceNumber: true } } },
      take: 200,
    });
    const numbers = scans.flatMap((s) => {
      const number = s.linkedEntry?.invoiceNumber;
      if (!number) return [];
      const data = s.extractedData as { vendor?: string; checks?: { proof?: Proof } } | null;
      return [{ invoiceNumber: number, vendorName: data?.vendor ?? null, gap: data?.checks?.proof?.gap ?? 0 }];
    });
    numbers.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    return { success: true as const, data: numbers };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the invoices to confirm', error, 'read') };
  }
}

async function loadInvoice(restaurantId: string, invoiceNumber: string) {
  const items = await prisma.invoiceItem.findMany({
    where: { restaurantId, invoiceNumber },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, productName: true, quantity: true, unit: true, unitPrice: true, totalPrice: true, vatRate: true,
      invoiceDate: true, costEntryId: true, vendorId: true, categoryId: true, receiptScanId: true,
      packFactor: true, vendor: { select: { name: true } },
    },
  });
  if (items.length === 0) return null;

  const entryId = items.find((i) => i.costEntryId)?.costEntryId ?? null;
  const entry = entryId
    ? await prisma.costEntry.findFirst({
        where: { id: entryId, restaurantId },
        select: { id: true, amount: true, splitFromId: true },
      })
    : null;
  const rootId = entry?.splitFromId ?? entry?.id ?? null;
  const entries = rootId
    ? await prisma.costEntry.findMany({
        where: { restaurantId, deletedAt: null, OR: [{ id: rootId }, { splitFromId: rootId }] },
        select: { amount: true },
      })
    : [];
  const grandTotal = cents(entries.reduce((sum, e) => sum + Number(e.amount), 0));

  const scanId = items.find((i) => i.receiptScanId)?.receiptScanId ?? null;
  const scan = await prisma.receiptScan.findFirst({
    where: {
      restaurantId,
      OR: [
        ...(scanId ? [{ id: scanId }] : []),
        ...(rootId ? [{ linkedEntryId: rootId }] : []),
      ],
      NOT: { imageUrl: '' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, imageUrl: true, extractedData: true },
  });

  return { items, entryId, grandTotal, scan };
}

/** One invoice's lines, photograph and figures, for checking by eye. */
export async function getInvoiceForProof(invoiceNumber: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const invoice = await loadInvoice(owner.restaurantId, invoiceNumber);
    if (!invoice) return { error: 'accounting.lineNotFound' };

    const stored = invoice.scan?.extractedData as { checks?: { proof?: Proof } } | null | undefined;
    const first = invoice.items[0];
    const data: InvoiceForProof = {
      invoiceNumber,
      vendorName: first.vendor?.name ?? null,
      date: first.invoiceDate ? first.invoiceDate.toISOString().slice(0, 10) : null,
      imagePath: invoice.scan?.imageUrl ?? null,
      grandTotal: invoice.grandTotal,
      truth: stored?.checks?.proof?.truth ?? [],
      lines: invoice.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPrice: Number(i.unitPrice),
        total: Number(i.totalPrice),
        vatRate: i.vatRate === null ? null : Number(i.vatRate),
      })),
    };
    return { success: true as const, data };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the invoice', error, 'read') };
  }
}

/**
 * Reads the stored photograph again with today's reader.
 *
 * Saves nothing: the proposal comes back to the screen, where the owner sees
 * it beside the page and decides. This is how an invoice read badly in the
 * past gets put right.
 */
export async function rereadInvoice(invoiceNumber: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const invoice = await loadInvoice(owner.restaurantId, invoiceNumber);
    if (!invoice?.scan) return { error: 'proof.errors.noImage' };

    const { data, proof } = await rereadStoredDocument({
      restaurantId: owner.restaurantId,
      userId: owner.userId,
      storedPath: invoice.scan.imageUrl,
    });
    if (data.type !== 'cost_receipt') return { error: 'proof.errors.reread' };

    const lines: ProofLine[] = data.items.map((item) => ({
      productName: item.product,
      quantity: item.quantity,
      unit: item.unit ?? null,
      unitPrice: item.unitPrice,
      total: item.total,
      vatRate: item.vatRate ?? null,
    }));
    return { success: true as const, data: { lines, truth: proof?.truth ?? [] } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the invoice again', error, 'read') };
  }
}

/**
 * Saves the lines as the owner confirmed them.
 *
 * Lines that do not add up are refused unless the owner says to keep them
 * anyway: sometimes the page itself is odd, and that is their call to make.
 */
export async function saveInvoiceProof(input: {
  invoiceNumber: string;
  lines: ProofLine[];
  truth: TaxTruth[];
  /** Keep it even though it does not add up. */
  accept: boolean;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId, userId } = owner;

    const invoice = await loadInvoice(restaurantId, input.invoiceNumber);
    if (!invoice) return { error: 'accounting.lineNotFound' };
    if (input.lines.length === 0) return { error: 'proof.errors.noLines' };
    const usable = input.lines.every((l) =>
      l.productName.trim() && Number.isFinite(l.quantity) && Number.isFinite(l.unitPrice) && Number.isFinite(l.total));
    if (!usable) return { error: 'proof.errors.badLine' };

    // Held to the QR's figures when that is where they came from.
    const stored = invoice.scan?.extractedData as { checks?: { proof?: Proof } } | null | undefined;
    const fromQr = stored?.checks?.proof?.source === 'qr';
    const proof = checkReading(
      { items: input.lines, grandTotal: invoice.grandTotal, vatSummary: input.truth },
      fromQr ? { taxes: input.truth } : null,
    );
    if (proof.status === 'failed' && !input.accept) return { error: 'proof.errors.doesNotAddUp' };

    const first = invoice.items[0];
    const known = new Map(invoice.items.map((i) => [i.id, i]));
    const kept = new Set(input.lines.flatMap((l) => (l.id && known.has(l.id) ? [l.id] : [])));
    const added = input.lines.filter((l) => !l.id || !known.has(l.id));

    // What the restaurant already knows about the wordings coming in anew.
    const keys = [...new Set(added.map((l) => lineKey(l.productName)))];
    const [memories, links] = keys.length === 0 ? [[], []] : await Promise.all([
      prisma.invoiceLineMemory.findMany({
        where: { restaurantId, sourceName: { in: keys } },
        select: { sourceName: true, vendorId: true, categoryId: true, notIngredient: true, packAmount: true, packUnit: true },
      }),
      prisma.invoiceItemLink.findMany({
        where: { restaurantId, sourceName: { in: keys } },
        select: { sourceName: true },
      }),
    ]);
    const linked = new Set(links.map((l) => l.sourceName));

    const gross = (line: ProofLine) =>
      line.vatRate === null ? null : cents(line.total * (1 + line.vatRate / 100));

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({
        where: { restaurantId, id: { in: invoice.items.filter((i) => !kept.has(i.id)).map((i) => i.id) } },
      });

      for (const line of input.lines) {
        const before = line.id ? known.get(line.id) : undefined;
        if (!before) continue;
        const sameCount = Number(before.quantity) === line.quantity;
        await tx.invoiceItem.update({
          where: { id: before.id },
          data: {
            quantity: line.quantity,
            unit: line.unit?.trim() || null,
            unitPrice: line.unitPrice,
            totalPrice: line.total,
            vatRate: line.vatRate,
            grossTotal: gross(line),
            // A quantity typed by hand is what was bought, not a print to multiply.
            ...(sameCount ? {} : { packFactor: null }),
          },
        });
      }

      for (const line of added) {
        const key = lineKey(line.productName);
        const memory = memories.find((m) => m.sourceName === key && m.vendorId === first.vendorId)
          ?? memories.find((m) => m.sourceName === key);
        const pack = memory ? rememberedPack(memory) : null;
        const restated = pack
          ? restateLine({ quantity: line.quantity, unit: line.unit, total: line.total, packFactor: null }, pack)
          : null;
        await tx.invoiceItem.create({
          data: {
            restaurantId,
            costEntryId: invoice.entryId,
            vendorId: first.vendorId,
            receiptScanId: invoice.scan?.id ?? null,
            productName: line.productName.trim(),
            normalizedName: normalizeProductName(line.productName),
            quantity: restated?.quantity ?? line.quantity,
            unit: restated?.unit ?? (line.unit?.trim() || null),
            unitPrice: restated?.unitPrice ?? line.unitPrice,
            totalPrice: line.total,
            packFactor: restated?.packFactor ?? null,
            vatRate: line.vatRate,
            grossTotal: gross(line),
            invoiceDate: first.invoiceDate,
            invoiceNumber: input.invoiceNumber,
            categoryId: memory?.categoryId ?? first.categoryId,
            categorySource: memory?.categoryId ? 'MEMORY' : first.categoryId ? 'INHERITED' : null,
            needsSetup: !linked.has(key) && !memory?.notIngredient,
          },
        });
      }

      if (invoice.entryId) {
        await rebalanceInvoice(tx, { restaurantId, costEntryId: invoice.entryId, userId });
      }
      if (invoice.scan) {
        await tx.receiptScan.update({
          where: { id: invoice.scan.id },
          data: { proofStatus: proof.status === 'failed' ? 'accepted' : proof.status, proofResolvedAt: new Date() },
        });
      }
    }, { timeout: 30_000 });

    await repriceIngredients(restaurantId);
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the invoice lines', error, 'write') };
  }
}
