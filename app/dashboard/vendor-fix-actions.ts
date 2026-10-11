'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { isValidNif } from '@/lib/pt-validation';
import { lineKey } from '@/lib/invoice-categories';
import { normaliseName } from '@/lib/vendor-reading';
import { invoiceEntryIds } from '@/lib/invoice-split-server';
import { repriceIngredients } from '@/lib/ingredient-costs-server';
import { ensureVendor, mergeVendorsTx, moveWordingAnswers } from '@/lib/vendors-server';

/**
 * Putting right who an invoice is from.
 *
 * Two different mistakes, two different fixes:
 *
 * - The supplier is right but its name is wrong. Recheio's NIF on file under
 *   "DANIEL MARQUES ARAÚJO" — the customer the invoice was addressed to, read
 *   off the wrong block. Every invoice under that supplier is Recheio's, so
 *   the supplier is renamed and all of them follow at once.
 * - One invoice was put under the wrong company. Only that invoice moves: its
 *   cost and the parts it was split into, its lines, what was learned from
 *   them, and the reader's recorded mistakes.
 *
 * Payments need nothing: a due date follows the supplier's terms, read when
 * it is shown, so it moves with the invoice by itself.
 *
 * Owner-only. Errors are dictionary keys.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return name.length >= 2 && name.length <= 200 ? name : null;
}

/** Digits of a NIF, '' for none, or null when it is not a valid one. */
function cleanNif(value: unknown): string | null {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!digits) return '';
  return isValidNif(digits) ? digits : null;
}

/** The cost entries an invoice is: by its lines, and any cost typed with its number. */
async function invoiceCosts(restaurantId: string, number: string) {
  const lines = await prisma.invoiceItem.findMany({
    where: {
      restaurantId,
      invoiceNumber: number,
      AND: [{ OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] }],
    },
    select: {
      id: true, productName: true, normalizedName: true, totalPrice: true, invoiceDate: true,
      costEntryId: true, vendorId: true, receiptScanId: true,
    },
  });
  const typed = await prisma.costEntry.findMany({
    where: { restaurantId, deletedAt: null, invoiceNumber: number },
    select: { id: true },
  });

  const roots = new Set([...lines.map((l) => l.costEntryId), ...typed.map((c) => c.id)].filter(Boolean) as string[]);
  const costIds = new Set<string>();
  for (const id of roots) {
    for (const part of await invoiceEntryIds(prisma, restaurantId, id)) costIds.add(part);
  }
  const costs = costIds.size
    ? await prisma.costEntry.findMany({
        where: { id: { in: [...costIds] }, restaurantId, deletedAt: null },
        select: { id: true, amount: true, date: true, vendorId: true },
      })
    : [];
  return { lines, costs };
}

/** How many invoices, lines and fixed costs a supplier still has. */
async function vendorUse(restaurantId: string, vendorId: string) {
  const [lines, costs, recurring] = await Promise.all([
    prisma.invoiceItem.count({ where: { restaurantId, vendorId } }),
    prisma.costEntry.count({ where: { restaurantId, vendorId, deletedAt: null, splitFromId: null } }),
    prisma.recurringCost.count({ where: { restaurantId, vendorId, active: true } }),
  ]);
  return { lines, costs, recurring };
}

/**
 * Records that the owner said who the supplier really is, against each
 * reading involved, so the Cérebro counts the reader's mistake.
 */
async function recordVendorCorrection(
  restaurantId: string,
  scanIds: string[],
  vendor: { id: string; name: string },
) {
  if (scanIds.length === 0) return;
  const scans = await prisma.receiptScan.findMany({
    where: { id: { in: scanIds }, restaurantId },
    select: { id: true, extractedData: true },
  });
  for (const scan of scans) {
    const read = (scan.extractedData as { vendor?: string } | null)?.vendor ?? null;
    if (read && normaliseName(read) === normaliseName(vendor.name)) continue;
    const existing = await prisma.scanCorrection.findFirst({
      where: { restaurantId, receiptScanId: scan.id, field: 'vendor', productName: null },
      select: { id: true },
    });
    const data = { vendorId: vendor.id, readValue: read, savedValue: vendor.name, fixedBy: 'owner' };
    if (existing) await prisma.scanCorrection.update({ where: { id: existing.id }, data });
    else await prisma.scanCorrection.create({ data: { ...data, restaurantId, receiptScanId: scan.id, field: 'vendor' } });
  }
}

/**
 * What the correction dialog needs: the invoice, the supplier it is under,
 * what else that document has been read as, and the suppliers on file.
 * Given a supplier rather than an invoice, only the supplier.
 */
export async function getVendorFixContext(input: { invoiceNumber?: string; vendorId?: string }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const restaurantId = owner.restaurantId;

    const number = input.invoiceNumber?.trim() || null;
    let invoice: { number: string; date: string | null; total: number; lineCount: number } | null = null;
    let vendorId = input.vendorId && UUID.test(input.vendorId) ? input.vendorId : null;
    let readings: Array<{ name: string; taxId: string | null }> = [];

    if (number) {
      const { lines, costs } = await invoiceCosts(restaurantId, number);
      if (lines.length === 0 && costs.length === 0) return { error: 'accounting.invoiceNotFound' };
      const total = costs.length
        ? costs.reduce((s, c) => s + Number(c.amount), 0)
        : lines.reduce((s, l) => s + Number(l.totalPrice), 0);
      const date = lines[0]?.invoiceDate ?? costs[0]?.date ?? null;
      invoice = {
        number,
        date: date ? date.toISOString().slice(0, 10) : null,
        total: Math.round(total * 100) / 100,
        lineCount: lines.length,
      };
      // The supplier most of the document is under.
      const counts = new Map<string, number>();
      for (const v of [...lines.map((l) => l.vendorId), ...costs.map((c) => c.vendorId)]) {
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      vendorId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      // Every reading of this document. A second scan often read it right,
      // and was refused only because the invoice was already in.
      const scans = await prisma.receiptScan.findMany({
        where: { restaurantId, extractedData: { path: ['invoiceNumber'], equals: number } },
        select: { id: true, extractedData: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      // A name the owner already corrected away from is not a suggestion.
      const rejected = await prisma.scanCorrection.findMany({
        where: { restaurantId, receiptScanId: { in: scans.map((s) => s.id) }, field: 'vendor', fixedBy: 'owner' },
        select: { readValue: true },
      });
      const seen = new Set<string>(rejected.map((r) => normaliseName(r.readValue ?? '')).filter(Boolean));
      for (const scan of scans) {
        const data = scan.extractedData as { vendor?: string; vendorTaxId?: string } | null;
        const name = data?.vendor?.trim();
        if (!name || seen.has(normaliseName(name))) continue;
        seen.add(normaliseName(name));
        readings.push({ name, taxId: data?.vendorTaxId?.replace(/\D/g, '') || null });
      }
    }

    const [current, vendors] = await Promise.all([
      vendorId
        ? prisma.vendor.findFirst({
            where: { id: vendorId, restaurantId },
            select: { id: true, name: true, taxId: true },
          })
        : null,
      prisma.vendor.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true, taxId: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!number && !current) return { error: 'accounting.vendorNotFound' };

    const use = current ? await vendorUse(restaurantId, current.id) : null;
    if (current) readings = readings.filter((r) => normaliseName(r.name) !== normaliseName(current.name));

    return {
      success: true as const,
      data: {
        invoice,
        current: current ? { ...current, invoices: use?.costs ?? 0 } : null,
        readings,
        vendors,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the supplier', error, 'read') };
  }
}

/**
 * Renames a supplier, or corrects its NIF — for all of its invoices.
 *
 * If the new name or NIF is already another supplier's, the two are the same
 * company on file twice. Nothing is changed until the owner says to join
 * them; then this one is folded into that one, with everything it had.
 */
export async function renameVendor(input: {
  vendorId: string;
  name: string;
  taxId: string;
  /** The owner agreed to join this supplier into the one that clashed. */
  mergeIntoId?: string | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const restaurantId = owner.restaurantId;

    const name = cleanName(input.name);
    if (!name) return { error: 'vendorFix.invalidName' };
    const nif = cleanNif(input.taxId);
    if (nif === null) return { error: 'vendorFix.invalidNif' };

    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, restaurantId },
      select: { id: true },
    });
    if (!vendor) return { error: 'accounting.vendorNotFound' };

    const clash = await prisma.vendor.findFirst({
      where: {
        restaurantId,
        id: { not: vendor.id },
        OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(nif ? [{ taxId: nif }] : [])],
      },
      select: { id: true, name: true, taxId: true },
    });

    let keepId = vendor.id;
    if (clash) {
      if (input.mergeIntoId !== clash.id) {
        return { success: true as const, data: { conflict: clash, merged: false } };
      }
      await prisma.$transaction((tx) => mergeVendorsTx(tx, { restaurantId, keepId: clash.id, mergeIds: [vendor.id] }));
      keepId = clash.id;
    }

    await prisma.vendor.update({
      where: { id: keepId },
      data: { name, taxId: nif || null, isActive: true },
    });

    // The readings behind this supplier's invoices, so the Cérebro knows
    // the reader named it wrongly.
    const scanIds = await prisma.invoiceItem.findMany({
      where: { restaurantId, vendorId: keepId, receiptScanId: { not: null } },
      select: { receiptScanId: true },
      distinct: ['receiptScanId'],
    });
    await recordVendorCorrection(restaurantId, scanIds.map((s) => s.receiptScanId!), { id: keepId, name });

    return { success: true as const, data: { conflict: null, merged: !!clash, vendorId: keepId } };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') return { error: 'vendorFix.nameTaken' };
    return { error: toClientError('Failed to rename the supplier', error, 'write') };
  }
}

/**
 * Moves one invoice to another supplier — one on file, or a new one — with
 * everything that hangs off it. Returns any supplier left with nothing, so
 * the owner can be offered to delete it.
 */
export async function moveInvoiceToVendor(input: {
  invoiceNumber: string;
  toVendorId?: string | null;
  newVendor?: { name: string; taxId: string } | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const restaurantId = owner.restaurantId;

    const number = input.invoiceNumber?.trim();
    if (!number) return { error: 'accounting.invoiceNotFound' };
    const { lines, costs } = await invoiceCosts(restaurantId, number);
    if (lines.length === 0 && costs.length === 0) return { error: 'accounting.invoiceNotFound' };

    // Where it goes.
    let target: { id: string; name: string } | null = null;
    if (input.toVendorId) {
      target = await prisma.vendor.findFirst({
        where: { id: input.toVendorId, restaurantId },
        select: { id: true, name: true },
      });
      if (!target) return { error: 'accounting.vendorNotFound' };
    } else {
      const name = cleanName(input.newVendor?.name);
      if (!name) return { error: 'vendorFix.invalidName' };
      const nif = cleanNif(input.newVendor?.taxId);
      if (nif === null) return { error: 'vendorFix.invalidNif' };
      const made = await ensureVendor(restaurantId, name, nif || null);
      target = await prisma.vendor.findFirst({ where: { id: made.id }, select: { id: true, name: true } });
    }
    if (!target) return { error: 'accounting.vendorNotFound' };

    const fromIds = [...new Set([...lines.map((l) => l.vendorId), ...costs.map((c) => c.vendorId)].filter(Boolean) as string[])]
      .filter((id) => id !== target!.id);
    if (fromIds.length === 0 && lines.every((l) => l.vendorId === target!.id) && costs.every((c) => c.vendorId === target!.id)) {
      return { error: 'vendorFix.sameSupplier' };
    }

    const wordings = [...new Set(lines.map((l) => lineKey(l.productName)))];
    const lineIds = lines.map((l) => l.id);

    // A wording the old supplier also prints on other invoices keeps its
    // answer there; the moved invoice takes a copy.
    const copyOnlyBy = new Map<string, Set<string>>();
    for (const fromId of fromIds) {
      const others = await prisma.invoiceItem.findMany({
        where: { restaurantId, vendorId: fromId, id: { notIn: lineIds } },
        select: { productName: true },
      });
      const elsewhere = new Set(others.map((o) => lineKey(o.productName)));
      copyOnlyBy.set(fromId, new Set(wordings.filter((w) => elsewhere.has(w))));
    }

    const scanIds = [...new Set(lines.map((l) => l.receiptScanId).filter(Boolean) as string[])];

    await prisma.$transaction(async (tx) => {
      if (lineIds.length) {
        await tx.invoiceItem.updateMany({ where: { id: { in: lineIds }, restaurantId }, data: { vendorId: target!.id } });
      }
      if (costs.length) {
        await tx.costEntry.updateMany({
          where: { id: { in: costs.map((c) => c.id) }, restaurantId },
          data: { vendorId: target!.id },
        });
      }
      if (scanIds.length) {
        await tx.scanCorrection.updateMany({
          where: { restaurantId, receiptScanId: { in: scanIds } },
          data: { vendorId: target!.id },
        });
      }
      for (const fromId of fromIds) {
        await moveWordingAnswers(tx, {
          restaurantId,
          fromVendorId: fromId,
          toVendorId: target!.id,
          wordings,
          copyOnly: copyOnlyBy.get(fromId) ?? new Set(),
        });
      }
    });

    await recordVendorCorrection(restaurantId, scanIds, target);

    // An ingredient can be linked to a wording through a supplier, so its
    // price is worked out again now that the lines are someone else's.
    await repriceIngredients(restaurantId, {
      touching: { normalizedNames: [...new Set(lines.map((l) => l.normalizedName))], sourceNames: wordings },
    });

    const orphans: Array<{ id: string; name: string }> = [];
    for (const fromId of fromIds) {
      const use = await vendorUse(restaurantId, fromId);
      if (use.lines + use.costs + use.recurring > 0) continue;
      const v = await prisma.vendor.findFirst({ where: { id: fromId, restaurantId }, select: { id: true, name: true } });
      if (v) orphans.push(v);
    }

    return {
      success: true as const,
      data: { vendor: target, lines: lineIds.length, costs: costs.length, orphans },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to move the invoice', error, 'write') };
  }
}

/**
 * Deletes a supplier that no longer has anything: no invoice, no cost, no
 * fixed cost. Anything else is refused — deleting a supplier with history
 * would take its price history with it.
 */
export async function deleteEmptyVendor(vendorId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, restaurantId: owner.restaurantId },
      select: { id: true },
    });
    if (!vendor) return { error: 'accounting.vendorNotFound' };

    const use = await vendorUse(owner.restaurantId, vendor.id);
    if (use.lines + use.costs + use.recurring > 0) return { error: 'vendorFix.notEmpty' };

    // Costs already deleted and fixed costs already stopped can still name
    // it; they let go of it rather than keep it alive.
    await prisma.$transaction([
      prisma.costEntry.updateMany({ where: { restaurantId: owner.restaurantId, vendorId: vendor.id }, data: { vendorId: null } }),
      prisma.recurringCost.updateMany({ where: { restaurantId: owner.restaurantId, vendorId: vendor.id }, data: { vendorId: null } }),
      prisma.vendor.delete({ where: { id: vendor.id } }),
    ]);
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to delete the supplier', error, 'delete') };
  }
}
