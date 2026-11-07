'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { normalizeProductName } from '@/lib/price-tracking';
import { lineKey, withoutBatch } from '@/lib/invoice-categories';
import { rememberedPack, type RememberedPack } from '@/lib/invoice-matching';
import { teachPack } from '@/lib/invoice-memory-server';
import { rebalanceInvoice } from '@/lib/invoice-split-server';
import { repriceIngredients } from '@/lib/ingredient-costs-server';
import { rereadStoredDocument } from '@/lib/scan-core';
import { PACK_UNITS, asPrinted, fromPrinted, lineFigures, packOfLine, takesPack, toPack, toPackInput, type PackInput, isDiscountLine } from '@/lib/line-setup';
import { formatPack } from '@/lib/scan-corrections';
import { checkReading, type DocumentIssue, type Proof, type TaxTruth } from '@/lib/invoice-checks';
import { settleSavedFigures } from '@/lib/invoice-sweep-server';
import { changedLines, correctedItems } from '@/lib/reading-corrections';
import type { CostReceiptResult } from '@/lib/document-scanner';

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
  /** The pages after the first. */
  pagePaths: string[];
  /** Why this invoice is here. */
  issues: DocumentIssue[];
  /** What the document says was taken off the whole invoice. */
  discountTotal: number;
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
    select: { id: true, imageUrl: true, pageUrls: true, extractedData: true },
  });

  return { items, entryId, rootId, grandTotal, scan };
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

    const stored = invoice.scan?.extractedData as {
      discountTotal?: number;
      checks?: { proof?: Proof; issues?: DocumentIssue[] };
    } | null | undefined;
    const first = invoice.items[0];
    const data: InvoiceForProof = {
      invoiceNumber,
      vendorName: first.vendor?.name ?? null,
      date: first.invoiceDate ? first.invoiceDate.toISOString().slice(0, 10) : null,
      imagePath: invoice.scan?.imageUrl ?? null,
      pagePaths: invoice.scan?.pageUrls ?? [],
      issues: stored?.checks?.issues ?? [],
      discountTotal: stored?.discountTotal ?? 0,
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
export async function rememberedPacks(input: { products: string[]; vendorId: string | null }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const keys = [...new Set(input.products.map((product) => lineKey(withoutBatch(product))))];
    const memories = await prisma.invoiceLineMemory.findMany({
      where: { restaurantId: owner.restaurantId, sourceName: { in: keys }, packUnit: { not: null } },
      select: { sourceName: true, vendorId: true, packAmount: true, packUnit: true },
    });
    const known: Record<string, PackInput> = {};
    for (const key of keys) {
      const memory = memories.find((m) => m.sourceName === key && m.vendorId === input.vendorId)
        ?? memories.find((m) => m.sourceName === key);
      const pack = memory ? toPackInput(rememberedPack(memory)) : null;
      if (pack) known[key] = pack;
    }
    return { success: true as const, data: known };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read what each unit holds', error, 'read') };
  }
}

export async function rereadInvoice(invoiceNumber: string, qrText?: string | null) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const invoice = await loadInvoice(owner.restaurantId, invoiceNumber);
    if (!invoice?.scan) return { error: 'proof.errors.noImage' };

    const { data, proof } = await rereadStoredDocument({
      restaurantId: owner.restaurantId,
      userId: owner.userId,
      storedPath: invoice.scan.imageUrl,
      extraPaths: invoice.scan.pageUrls,
      qrTexts: qrText ? [qrText] : [],
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
    return {
      success: true as const,
      data: {
        lines,
        truth: proof?.truth ?? [],
        issues: data.checks?.issues ?? [],
        discountTotal: data.discountTotal ?? 0,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the invoice again', error, 'read') };
  }
}

/**
 * Puts the invoice's cost right when the document says otherwise.
 *
 * Asked for, never automatic: this moves the owner's money. The amount comes from
 * the document's own figures, not from anything typed, and is shared out across
 * the invoice's categories the same way any other total is.
 */
export async function adoptDocumentTotal(input: { invoiceNumber: string; truth: TaxTruth[] }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId, userId } = owner;

    const invoice = await loadInvoice(restaurantId, input.invoiceNumber);
    if (!invoice?.rootId) return { error: 'accounting.lineNotFound' };

    const stored = invoice.scan?.extractedData as { checks?: { proof?: Proof } } | null | undefined;
    const known = stored?.checks?.proof?.truth?.length ? stored.checks.proof.truth : input.truth;
    if (known.length === 0) return { error: 'proof.errors.noFigures' };

    const total = cents(known.reduce((sum, b) => sum + b.base + b.tax, 0));
    const difference = cents(total - invoice.grandTotal);
    if (Math.abs(difference) < 0.01) return { success: true as const, data: { total } };

    await prisma.$transaction(async (tx) => {
      const root = await tx.costEntry.findFirst({
        where: { id: invoice.rootId!, restaurantId },
        select: { amount: true },
      });
      if (!root) return;
      await tx.costEntry.update({
        where: { id: invoice.rootId! },
        data: { amount: cents(Number(root.amount) + difference) },
      });
      await rebalanceInvoice(tx, { restaurantId, costEntryId: invoice.rootId!, userId });
      await tx.auditLog.create({
        data: {
          restaurantId,
          action: 'invoice.total.corrected',
          actorUserId: userId,
          metadata: { invoiceNumber: input.invoiceNumber, from: invoice.grandTotal, to: total },
        },
      });
    }, { timeout: 30_000 });
    return { success: true as const, data: { total } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to correct the invoice total', error, 'write') };
  }
}

/**
 * Puts the owner's figures on a reading that has not been saved yet.
 *
 * Nothing reaches the books here: the invoice still goes through its confirmation.
 * What changes is that the owner has compared it with the paper, so it no longer
 * waits for that question, now or after it is saved.
 */
export async function correctReading(input: {
  scanId: string;
  lines: ProofLine[];
  /** Take the total the document's tax table adds up to. */
  adoptTotal: boolean;
  /** Keep it even though it does not add up. */
  accept: boolean;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const { restaurantId } = owner;

    const scan = await prisma.receiptScan.findFirst({
      where: { id: input.scanId, restaurantId, linkedEntryId: null },
      select: { extractedData: true },
    });
    const reading = scan?.extractedData as unknown as CostReceiptResult | null | undefined;
    if (reading?.type !== 'cost_receipt') return { error: 'accounting.lineNotFound' };

    if (input.lines.length === 0) return { error: 'proof.errors.noLines' };
    const usable = input.lines.every((l) =>
      l.productName.trim() && Number.isFinite(l.quantity) && Number.isFinite(l.unitPrice) && Number.isFinite(l.total));
    if (!usable) return { error: 'proof.errors.badLine' };
    if (input.lines.some((l) => l.pack && (!PACK_UNITS.includes(l.pack.unit) || !toPack(l.pack)))) {
      return { error: 'lineSetup.errors.pack' };
    }

    const was = reading.checks?.proof;
    const truth = was?.truth ?? [];
    const grandTotal = input.adoptTotal && truth.length
      ? cents(truth.reduce((sum, b) => sum + b.base + b.tax, 0))
      : reading.grandTotal;
    const items = correctedItems(reading.items, input.lines);
    const proof = checkReading(
      { items, grandTotal, vatSummary: truth },
      was?.source === 'qr' ? { taxes: truth } : null,
    );
    if (proof.status === 'failed' && !input.accept) return { error: 'proof.errors.doesNotAddUp' };

    const vendorId = reading.checks?.knownVendorId ?? null;
    const corrected: CostReceiptResult = {
      ...reading,
      items,
      grandTotal,
      // The owner has looked at it beside the paper: there is nothing left to warn about.
      checks: reading.checks && { ...reading.checks, proof, issues: [] },
    };
    await prisma.$transaction([
      prisma.receiptScan.update({
        where: { id: input.scanId },
        data: {
          extractedData: JSON.parse(JSON.stringify(corrected)),
          proofStatus: proof.status === 'failed' ? 'accepted' : proof.status,
          proofResolvedAt: new Date(),
        },
      }),
      prisma.scanCorrection.createMany({
        data: changedLines(reading.items, input.lines).map((change) => ({
          restaurantId,
          receiptScanId: input.scanId,
          vendorId,
          field: 'line',
          fixedBy: 'owner',
          ...change,
        })),
      }),
    ]);

    if (vendorId) {
      for (const line of input.lines.filter((l) => l.packChanged)) {
        await teachPack({
          restaurantId,
          vendorId,
          sourceName: lineKey(line.productName),
          pack: (line.pack && toPack(line.pack)) ?? 'packages',
        });
      }
    }
    return { success: true as const, data: corrected };
  } catch (error: unknown) {
    return { error: toClientError('Failed to correct the reading', error, 'write') };
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
            needsSetup: !isDiscountLine(line.total) && !linked.has(key) && !memory?.notIngredient,
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
