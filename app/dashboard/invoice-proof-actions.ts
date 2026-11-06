'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { normalizeProductName } from '@/lib/price-tracking';
import { lineKey } from '@/lib/invoice-categories';
import { rememberedPack, type RememberedPack } from '@/lib/invoice-matching';
import { teachPack } from '@/lib/invoice-memory-server';
import { rebalanceInvoice } from '@/lib/invoice-split-server';
import { repriceIngredients } from '@/lib/ingredient-costs-server';
import { rereadStoredDocument } from '@/lib/scan-core';
import { PACK_UNITS, asPrinted, fromPrinted, lineFigures, packOfLine, takesPack, toPack, toPackInput, type PackInput } from '@/lib/line-setup';
import { formatPack } from '@/lib/scan-corrections';
import { checkReading, settleFigures, type Proof, type TaxTruth } from '@/lib/invoice-checks';

/**
 * Confirming an invoice whose lines do not add up.
 *
 * Most invoices prove themselves against their QR and nobody sees this. What
 * is left is shown beside its photograph, with what is still missing, and the
 * owner settles it. The money was already right: the total came from the QR.
 *
 * Lines travel here as the invoice prints them. What each one holds comes apart
 * from that, and only the stored line is the two put together.
 */

export interface ProofLine {
  /** Absent on a line that is not saved yet. */
  id?: string;
  productName: string;
  /** As printed: two bags, not the eight buns inside them. */
  quantity: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  vatRate: number | null;
  /** What each printed unit holds; null when it is counted as printed. */
  pack: PackInput | null;
  /** The owner answered it here, so it is taught for every purchase. */
  packChanged?: boolean;
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

/**
 * Settles a saved invoice the document's own figures can put right, or leaves it.
 *
 * Nobody should be sent to fix what the figures answer: wrong VAT rates, or
 * values saved with VAT in them. Every line must already multiply out, and the
 * invoice's total does not move, so one with anything else wrong still waits.
 */
async function settleSavedFigures(
  { restaurantId, userId }: { restaurantId: string; userId: string },
  scanId: string,
  invoiceNumber: string,
  truth: TaxTruth[],
): Promise<boolean> {
  if (truth.length === 0) return false;
  try {
    const items = await prisma.invoiceItem.findMany({
      where: { restaurantId, invoiceNumber },
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

    const settled = settleFigures(lines, truth);
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
      if (settled.vatIncluded) {
        const entries = new Set(items.flatMap((i) => (i.costEntryId ? [i.costEntryId] : [])));
        for (const costEntryId of entries) await rebalanceInvoice(tx, { restaurantId, costEntryId, userId });
      }
      await tx.receiptScan.update({
        where: { id: scanId },
        data: { proofStatus: 'proved', proofResolvedAt: new Date() },
      });
    }, { timeout: 30_000 });
    // What a kilo really cost has changed, and so has the ingredient.
    if (settled.vatIncluded) await repriceIngredients(restaurantId);
    return true;
  } catch {
    // It stays on the list, where the owner can still settle it.
    return false;
  }
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
      select: { id: true, extractedData: true, linkedEntry: { select: { invoiceNumber: true } } },
      take: 200,
    });
    const numbers = [];
    for (const s of scans) {
      const number = s.linkedEntry?.invoiceNumber;
      if (!number) continue;
      const data = s.extractedData as { vendor?: string; checks?: { proof?: Proof } } | null;
      const truth = data?.checks?.proof?.truth ?? [];
      if (await settleSavedFigures(owner, s.id, number, truth)) continue;
      numbers.push({ invoiceNumber: number, vendorName: data?.vendor ?? null, gap: data?.checks?.proof?.gap ?? 0 });
    }
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

function storedLine(item: {
  quantity: unknown; unit: string | null; unitPrice: unknown; totalPrice: unknown; packFactor: unknown;
}) {
  return {
    quantity: Number(item.quantity),
    unit: item.unit,
    unitPrice: Number(item.unitPrice),
    total: Number(item.totalPrice),
    packFactor: item.packFactor === null ? null : Number(item.packFactor),
  };
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
        ...asPrinted(storedLine(i)),
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

    // A new reading of the print knows nothing of what was already answered.
    const keys = [...new Set(data.items.map((item) => lineKey(item.product)))];
    const memories = await prisma.invoiceLineMemory.findMany({
      where: { restaurantId: owner.restaurantId, sourceName: { in: keys }, packUnit: { not: null } },
      select: { sourceName: true, vendorId: true, packAmount: true, packUnit: true },
    });
    const vendorId = invoice.items[0].vendorId;
    const answered = (key: string): RememberedPack | null => {
      const memory = memories.find((m) => m.sourceName === key && m.vendorId === vendorId)
        ?? memories.find((m) => m.sourceName === key);
      if (memory) return rememberedPack(memory);
      const saved = invoice.items.find((i) => lineKey(i.productName) === key);
      return saved ? packOfLine(storedLine(saved)) : null;
    };

    const lines: ProofLine[] = data.items.map((item) => {
      const pack = answered(lineKey(item.product));
      const unit = item.unit ?? null;
      return {
        productName: item.product,
        quantity: item.quantity,
        unit,
        unitPrice: item.unitPrice,
        total: item.total,
        vatRate: item.vatRate ?? null,
        pack: pack && pack !== 'packages' && takesPack(item.quantity, unit) ? toPackInput(pack) : null,
      };
    });
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
    const answers = new Map(input.lines.map((l) => [l, l.pack ? toPack(l.pack) : null]));
    if (input.lines.some((l) => l.pack && (!PACK_UNITS.includes(l.pack.unit) || !answers.get(l)))) {
      return { error: 'lineSetup.errors.pack' };
    }

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
        await tx.invoiceItem.update({
          where: { id: before.id },
          data: {
            ...fromPrinted(line, answers.get(line) ?? null),
            totalPrice: line.total,
            vatRate: line.vatRate,
            grossTotal: gross(line),
          },
        });

        // What the reader or an earlier hand got wrong is what it has to learn.
        const was = storedLine(before);
        const read = lineFigures({ ...was, ...asPrinted(was) });
        const saved = lineFigures({ ...line, unit: line.unit?.trim() || null });
        if (read !== saved) {
          await tx.scanCorrection.create({
            data: {
              restaurantId,
              receiptScanId: before.receiptScanId,
              vendorId: before.vendorId,
              productName: before.productName,
              field: 'line',
              readValue: read,
              savedValue: saved,
              fixedBy: 'owner',
            },
          });
        }
      }

      for (const line of added) {
        const key = lineKey(line.productName);
        const memory = memories.find((m) => m.sourceName === key && m.vendorId === first.vendorId)
          ?? memories.find((m) => m.sourceName === key);
        const stored = fromPrinted(line, answers.get(line) ?? (memory ? rememberedPack(memory) : null));
        await tx.invoiceItem.create({
          data: {
            restaurantId,
            costEntryId: invoice.entryId,
            vendorId: first.vendorId,
            receiptScanId: invoice.scan?.id ?? null,
            productName: line.productName.trim(),
            normalizedName: normalizeProductName(line.productName),
            ...stored,
            totalPrice: line.total,
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

    // One answer per wording, for every purchase of it and the ones to come.
    const taught = new Map(input.lines.filter((l) => l.packChanged).map((l) => [
      lineKey(l.productName),
      { line: l, pack: answers.get(l) ?? ('packages' as const) },
    ]));
    if (first.vendorId) {
      for (const [sourceName, { line, pack }] of taught) {
        const before = line.id ? known.get(line.id) : undefined;
        await teachPack({
          restaurantId,
          vendorId: first.vendorId,
          sourceName,
          pack,
        });
        await prisma.scanCorrection.create({
          data: {
            restaurantId,
            receiptScanId: invoice.scan?.id ?? null,
            vendorId: first.vendorId,
            productName: line.productName.trim(),
            field: 'pack',
            readValue: before ? formatPack(packOfLine(storedLine(before))) : null,
            savedValue: formatPack(pack),
            fixedBy: 'owner',
          },
        });
      }
    }

    await repriceIngredients(restaurantId);
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the invoice lines', error, 'write') };
  }
}
