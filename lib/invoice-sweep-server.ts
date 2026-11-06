import { prisma } from '@/lib/prisma';
import { checkReading, settleFigures, type Proof, type TaxTruth } from '@/lib/invoice-checks';
import { rebalanceInvoice } from '@/lib/invoice-split-server';
import { repriceIngredients } from '@/lib/ingredient-costs-server';
import { readStoredQr } from '@/lib/scan-core';

/**
 * Saved invoices, held to their own figures.
 *
 * Invoices saved before readings were proved can carry VAT in their line values
 * or the wrong rates, and nothing ever said so. The document's own totals decide:
 * what they can put right is put right, what they cannot goes to the owner, and
 * an invoice the owner has already settled is left as they left it.
 */

export type SweepOutcome = 'right' | 'fixed' | 'flagged' | 'noFigures';

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Settles a saved invoice the document's own figures can put right, or leaves it.
 *
 * Nobody should be sent to fix what the figures answer: wrong VAT rates, or
 * values saved with VAT in them. Every line must already multiply out, and the
 * invoice's total does not move, so one with anything else wrong still waits.
 */
export async function settleSavedFigures(
  { restaurantId, userId }: { restaurantId: string; userId: string },
  scanId: string,
  invoiceNumber: string,
  truth: TaxTruth[],
  vendorId?: string | null,
  discount = 0,
): Promise<boolean> {
  if (truth.length === 0) return false;
  try {
    const items = await prisma.invoiceItem.findMany({
      where: { restaurantId, invoiceNumber, ...(vendorId ? { vendorId } : {}) },
      select: {
        id: true, productName: true, quantity: true, unitPrice: true, totalPrice: true, vatRate: true, costEntryId: true,
      },
    });
    const lines = items.map((i) => ({
      productName: i.productName,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      total: Number(i.totalPrice),
      vatRate: i.vatRate === null ? null : Number(i.vatRate),
    }));
    const proof = checkReading({ items: lines, grandTotal: 0, vatSummary: truth }, null);
    if (proof.problems.some((p) => p.kind === 'line')) return false;

    const settled = settleFigures(lines, truth, discount);
    if (!settled || settled.drop.length > 0) return false;

    await prisma.$transaction(async (tx) => {
      for (const [i, item] of items.entries()) {
        const vatRate = settled.rates[i];
        const total = settled.totals[i];
        if (lines[i].vatRate === vatRate && lines[i].total === total) continue;
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: {
            vatRate,
            totalPrice: total,
            unitPrice: settled.unitPrices[i],
            grossTotal: settled.grossTotals[i] ?? cents(total * (1 + vatRate / 100)),
          },
        });
      }
      if (settled.vatIncluded || settled.discounted) {
        const entries = new Set(items.flatMap((i) => (i.costEntryId ? [i.costEntryId] : [])));
        for (const costEntryId of entries) await rebalanceInvoice(tx, { restaurantId, costEntryId, userId });
      }
      await tx.receiptScan.update({
        where: { id: scanId },
        data: { proofStatus: 'proved', proofResolvedAt: new Date() },
      });
    }, { timeout: 30_000 });
    // What a kilo really cost has changed, and so has the ingredient.
    if (settled.vatIncluded || settled.discounted) await repriceIngredients(restaurantId);
    return true;
  } catch {
    // It stays as it was, where the owner can still settle it.
    return false;
  }
}

/** Holds one saved invoice to its own figures. See the top of this file. */
export async function sweepInvoice(scanId: string): Promise<SweepOutcome> {
  const scan = await prisma.receiptScan.findUnique({
    where: { id: scanId },
    select: {
      id: true, restaurantId: true, userId: true, imageUrl: true, extractedData: true,
      proofStatus: true, proofResolvedAt: true,
      linkedEntry: { select: { id: true, splitFromId: true, invoiceNumber: true, vendorId: true } },
    },
  });
  const entry = scan?.linkedEntry;
  if (!scan || !entry?.invoiceNumber) return 'noFigures';

  const data = (scan.extractedData ?? {}) as {
    vatSummary?: TaxTruth[] | null;
    discountTotal?: number;
    checks?: { proof?: Proof; creditNote?: boolean } & Record<string, unknown>;
  } & Record<string, unknown>;
  if (data.checks?.creditNote) return 'noFigures';

  // Settled by the owner already: their answer stands.
  if (scan.proofStatus === 'accepted' || scan.proofResolvedAt) return 'right';

  const stored = data.checks?.proof?.truth?.length ? data.checks.proof.truth : null;
  const qr = stored ? null : await readStoredQr(scan.imageUrl);
  const truth = stored ?? (qr?.taxes?.length ? qr.taxes : null) ?? (data.vatSummary?.length ? data.vatSummary : null) ?? [];
  const fromRecord = data.checks?.proof?.source === 'qr' || !!qr?.taxes?.length;

  const { restaurantId, userId } = scan;
  const number = entry.invoiceNumber;
  const rootId = entry.splitFromId ?? entry.id;
  const [items, entries] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: { restaurantId, invoiceNumber: number, ...(entry.vendorId ? { vendorId: entry.vendorId } : {}) },
      select: { productName: true, quantity: true, unitPrice: true, totalPrice: true, vatRate: true },
    }),
    prisma.costEntry.findMany({
      where: { restaurantId, deletedAt: null, OR: [{ id: rootId }, { splitFromId: rootId }] },
      select: { amount: true },
    }),
  ]);
  if (items.length === 0 || entries.length === 0) return 'noFigures';

  const grandTotal = cents(entries.reduce((sum, e) => sum + Number(e.amount), 0));
  const proof = checkReading(
    {
      items: items.map((i) => ({
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        total: Number(i.totalPrice),
        vatRate: i.vatRate === null ? null : Number(i.vatRate),
      })),
      grandTotal,
      vatSummary: truth,
    },
    fromRecord ? { taxes: truth } : null,
  );

  if (proof.problems.length === 0) {
    // Lines that reach the total prove arithmetic, not the document: with no
    // figures of its own it stays uncounted either way.
    if (truth.length === 0) return 'noFigures';
    await prisma.receiptScan.update({ where: { id: scan.id }, data: { proofStatus: proof.status } });
    return 'right';
  }

  // The cost itself disagrees with the document: no line can answer that.
  const documentTotal = truth.reduce((sum, b) => sum + b.base + b.tax, 0);
  const costMatches = truth.length > 0 && Math.abs(documentTotal - grandTotal) <= 0.05;
  const discount = data.discountTotal ?? 0;
  if (costMatches && await settleSavedFigures({ restaurantId, userId }, scan.id, number, truth, entry.vendorId, discount)) {
    return 'fixed';
  }

  await prisma.receiptScan.update({
    where: { id: scan.id },
    data: {
      proofStatus: 'failed',
      proofResolvedAt: null,
      extractedData: JSON.parse(JSON.stringify({ ...data, checks: { ...data.checks, proof } })),
    },
  });
  return 'flagged';
}
