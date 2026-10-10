'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { dayKey } from '@/lib/ai-usage';
import { ensureVendor } from '@/lib/vendors-server';
import {
  PAYMENT_METHODS,
  addDays,
  daysBetween,
  dueDateFor,
  isDayKey,
  paidOn,
  parseTermsDays,
  paymentState,
  summarisePayables,
  toDayKey,
  type PayablesSummary,
  type PaymentMethodKey,
  type PaymentState,
} from '@/lib/payments';

/**
 * Payments: what each supplier is owed, and when.
 *
 * A payable is a cost as it was entered — the original entry, never the
 * parts an invoice was split into by category, since a Makro invoice with
 * meat, beer and bleach is still one document and is paid once. Its amount
 * is the whole invoice: the original plus its parts.
 *
 * Owner-only, like every cost. Errors are dictionary keys.
 */

/** How far back paid costs are listed. Open ones are listed however old. */
const PAID_HISTORY_DAYS = 365;
/** More than this in one go is not a click, it is a script. */
const MAX_BULK = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PayablesFilter = 'open' | 'overdue' | 'paid' | 'all';

export interface PayableRow {
  id: string;
  dateKey: string;
  dueKey: string;
  /** Days from today to the due date; negative when late. */
  daysUntilDue: number;
  amount: number;
  description: string | null;
  categoryName: string | null;
  /** The document number, typed or read off a scan. */
  invoiceNumber: string | null;
  /** A scanned invoice to open, by the number its lines carry. */
  previewNumber: string | null;
  /** True when the cost has no invoice yet: the paper can still be added. */
  needsInvoice: boolean;
  state: PaymentState;
  method: PaymentMethodKey | null;
  paidKey: string | null;
  /** The owner set this due date, rather than the supplier's terms. */
  dueIsOwn: boolean;
  recurring: boolean;
}

export interface PayableGroup {
  vendorId: string | null;
  vendorName: string | null;
  /** The supplier's own terms; null falls back to 30 days. */
  termsDays: number | null;
  open: { count: number; total: number };
  overdue: { count: number; total: number };
  rows: PayableRow[];
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const payableSelect = {
  id: true,
  date: true,
  amount: true,
  description: true,
  invoiceNumber: true,
  paymentMethod: true,
  paidAt: true,
  dueDate: true,
  recurringCostId: true,
  vendor: { select: { id: true, name: true, paymentTermsDays: true } },
  category: { select: { name: true } },
  splitParts: { where: { deletedAt: null }, select: { amount: true } },
  invoiceItems: { select: { invoiceNumber: true }, take: 1 },
} as const;

type PayableRecord = {
  id: string;
  date: Date;
  amount: unknown;
  description: string | null;
  invoiceNumber: string | null;
  paymentMethod: PaymentMethodKey | null;
  paidAt: Date | null;
  dueDate: Date | null;
  recurringCostId: string | null;
  vendor: { id: string; name: string; paymentTermsDays: number | null } | null;
  category: { name: string } | null;
  splitParts: Array<{ amount: unknown }>;
  invoiceItems: Array<{ invoiceNumber: string | null }>;
};

function toRow(e: PayableRecord, todayKey: string): PayableRow {
  const dateKey = toDayKey(e.date);
  const dueKey = dueDateFor({
    dateKey,
    dueKey: e.dueDate ? toDayKey(e.dueDate) : null,
    hasVendor: !!e.vendor,
    termsDays: e.vendor?.paymentTermsDays,
  });
  const paidKey = e.paidAt ? toDayKey(e.paidAt) : null;
  const status = { paidKey, method: e.paymentMethod, dueKey };
  const scanned = e.invoiceItems[0]?.invoiceNumber?.trim() || null;
  const number = e.invoiceNumber?.trim() || scanned;
  return {
    id: e.id,
    dateKey,
    dueKey,
    daysUntilDue: daysBetween(todayKey, dueKey),
    amount: cents(Number(e.amount) + e.splitParts.reduce((s, p) => s + Number(p.amount), 0)),
    description: e.description,
    categoryName: e.category?.name ?? null,
    invoiceNumber: number,
    previewNumber: scanned,
    needsInvoice: !number && e.invoiceItems.length === 0,
    state: paymentState(status, todayKey),
    method: e.paymentMethod,
    paidKey: paidOn(status, todayKey),
    dueIsOwn: !!e.dueDate,
    recurring: !!e.recurringCostId,
  };
}

const matchesFilter = (state: PaymentState, filter: PayablesFilter) =>
  filter === 'all'
    ? true
    : filter === 'paid'
      ? state === 'paid'
      : filter === 'overdue'
        ? state === 'overdue'
        : state !== 'paid';

/**
 * The costs, grouped by supplier, with what each is owed.
 *
 * The summary always covers everything still open (for the chosen supplier,
 * when one is chosen), whichever filter the list is on: the strip above the
 * list answers "what do I owe", and should not change when the owner looks
 * at what they have already paid.
 */
export async function getPayables(input: { filter?: PayablesFilter; vendorId?: string | null } = {}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const filter: PayablesFilter = input.filter ?? 'open';
    const vendorId = input.vendorId && UUID.test(input.vendorId) ? input.vendorId : null;
    const todayKey = dayKey(new Date());
    const since = new Date(`${addDays(todayKey, -PAID_HISTORY_DAYS)}T00:00:00Z`);

    const [records, vendors] = await Promise.all([
      prisma.costEntry.findMany({
        where: {
          restaurantId: owner.restaurantId,
          deletedAt: null,
          splitFromId: null,
          ...(vendorId ? { vendorId } : {}),
          OR: [{ paidAt: null }, { date: { gte: since } }],
        },
        select: payableSelect,
        orderBy: { date: 'asc' },
      }),
      prisma.vendor.findMany({
        where: { restaurantId: owner.restaurantId, isActive: true },
        select: { id: true, name: true, paymentTermsDays: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const rows = (records as PayableRecord[]).map((r) => ({ row: toRow(r, todayKey), vendor: r.vendor }));
    const summary: PayablesSummary = summarisePayables(rows.map((r) => r.row), todayKey);

    const groups = new Map<string, PayableGroup>();
    for (const { row, vendor } of rows) {
      if (!matchesFilter(row.state, filter)) continue;
      const key = vendor?.id ?? '';
      let group = groups.get(key);
      if (!group) {
        group = {
          vendorId: vendor?.id ?? null,
          vendorName: vendor?.name ?? null,
          termsDays: vendor?.paymentTermsDays ?? null,
          open: { count: 0, total: 0 },
          overdue: { count: 0, total: 0 },
          rows: [],
        };
        groups.set(key, group);
      }
      group.rows.push(row);
      if (row.state !== 'paid') {
        group.open.count += 1;
        group.open.total = cents(group.open.total + row.amount);
      }
      if (row.state === 'overdue') {
        group.overdue.count += 1;
        group.overdue.total = cents(group.overdue.total + row.amount);
      }
    }

    // Open first, soonest due at the top; paid after, latest payment first.
    for (const group of groups.values()) {
      group.rows.sort((a, b) => {
        const aOpen = a.state !== 'paid';
        const bOpen = b.state !== 'paid';
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        if (aOpen) return a.dueKey.localeCompare(b.dueKey) || a.dateKey.localeCompare(b.dateKey);
        return (b.paidKey ?? '').localeCompare(a.paidKey ?? '') || b.dateKey.localeCompare(a.dateKey);
      });
    }

    // The supplier most behind first; costs with no supplier last.
    const list = [...groups.values()].sort((a, b) => {
      if (!a.vendorId !== !b.vendorId) return a.vendorId ? -1 : 1;
      return (
        b.overdue.total - a.overdue.total ||
        b.open.total - a.open.total ||
        (a.vendorName ?? '').localeCompare(b.vendorName ?? '', 'pt')
      );
    });

    return {
      success: true as const,
      data: {
        today: todayKey,
        summary,
        groups: list,
        vendors: vendors.map((v) => ({ id: v.id, name: v.name, termsDays: v.paymentTermsDays })),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the payments', error, 'read') };
  }
}

/** What is owed and how soon, for the dashboard. */
export async function getPaymentsSummary() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const todayKey = dayKey(new Date());
    const records = await prisma.costEntry.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null, splitFromId: null, paidAt: null },
      select: payableSelect,
    });
    const summary = summarisePayables(
      (records as PayableRecord[]).map((r) => toRow(r, todayKey)),
      todayKey,
    );
    return { success: true as const, data: { today: todayKey, summary } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the payments', error, 'read') };
  }
}

function cleanIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK) return null;
  const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
  return clean.length > 0 ? clean : null;
}

/**
 * Marks costs as paid, one or many. Only originals of this restaurant are
 * touched; a part of a split invoice, or another tenant's id, is ignored.
 */
export async function markPaid(input: { ids: string[]; method: PaymentMethodKey; paidOn: string }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const ids = cleanIds(input.ids);
    if (!ids) return { error: 'payments.nothingSelected' };
    if (!PAYMENT_METHODS.includes(input.method)) return { error: 'payments.invalidMethod' };
    const todayKey = dayKey(new Date());
    if (!isDayKey(input.paidOn) || input.paidOn > todayKey) return { error: 'payments.invalidPaidDate' };

    const { count } = await prisma.costEntry.updateMany({
      where: { id: { in: ids }, restaurantId: owner.restaurantId, splitFromId: null, deletedAt: null },
      data: { paidAt: new Date(`${input.paidOn}T00:00:00Z`), paymentMethod: input.method },
    });
    return { success: true as const, data: { count } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to mark as paid', error, 'write') };
  }
}

/** Undoes a payment marked by mistake: the cost is open again. */
export async function markUnpaid(input: { ids: string[] }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const ids = cleanIds(input.ids);
    if (!ids) return { error: 'payments.nothingSelected' };

    const { count } = await prisma.costEntry.updateMany({
      where: { id: { in: ids }, restaurantId: owner.restaurantId, splitFromId: null, deletedAt: null },
      data: { paidAt: null, paymentMethod: null },
    });
    return { success: true as const, data: { count } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to reopen the payment', error, 'write') };
  }
}

/**
 * The owner's own due date for one cost, or null to follow the supplier's
 * terms again.
 */
export async function setDueDate(input: { id: string; dueDate: string | null }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    if (input.dueDate !== null && !isDayKey(input.dueDate)) return { error: 'payments.invalidDueDate' };

    const { count } = await prisma.costEntry.updateMany({
      where: { id: input.id, restaurantId: owner.restaurantId, splitFromId: null, deletedAt: null },
      data: { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null },
    });
    if (count === 0) return { error: 'payments.notFound' };
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to change the due date', error, 'write') };
  }
}

/**
 * How many days a supplier gives. Every invoice still open with them that
 * has no date of its own moves with it.
 */
export async function setVendorTerms(input: { vendorId: string; days: number | null }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const days = parseTermsDays(input.days);
    if (days === 'invalid') return { error: 'payments.invalidTerms' };

    const { count } = await prisma.vendor.updateMany({
      where: { id: input.vendorId, restaurantId: owner.restaurantId },
      data: { paymentTermsDays: days },
    });
    if (count === 0) return { error: 'accounting.vendorNotFound' };
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save the terms', error, 'write') };
  }
}

/** The original cost behind any of its parts, if it is this restaurant's. */
async function originalCost(restaurantId: string, costEntryId: string) {
  if (!UUID.test(costEntryId)) return null;
  const entry = await prisma.costEntry.findFirst({
    where: { id: costEntryId, restaurantId, deletedAt: null },
    select: { id: true, splitFromId: true },
  });
  if (!entry) return null;
  return prisma.costEntry.findFirst({
    where: { id: entry.splitFromId ?? entry.id, restaurantId, deletedAt: null },
    select: {
      id: true,
      vendorId: true,
      invoiceNumber: true,
      _count: { select: { invoiceItems: true, splitParts: true } },
    },
  });
}

/** Whether a document number is already on another cost or invoice. */
async function numberInUse(restaurantId: string, number: string, exceptId: string) {
  const [onCost, onLines] = await Promise.all([
    prisma.costEntry.findFirst({
      where: { restaurantId, deletedAt: null, invoiceNumber: number, id: { not: exceptId } },
      select: { id: true },
    }),
    prisma.invoiceItem.findFirst({
      where: {
        restaurantId,
        invoiceNumber: number,
        AND: [{ OR: [{ costEntryId: null }, { costEntry: { deletedAt: null } }] }],
      },
      select: { id: true },
    }),
  ]);
  return !!(onCost || onLines);
}

/**
 * The paper for a cost entered without it: the document number, and the
 * supplier when the cost had none.
 */
export async function attachInvoiceNumber(input: {
  costEntryId: string;
  invoiceNumber: string;
  vendorName?: string | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    const number = input.invoiceNumber?.trim().slice(0, 100);
    if (!number) return { error: 'payments.numberRequired' };

    const cost = await originalCost(owner.restaurantId, input.costEntryId);
    if (!cost) return { error: 'payments.notFound' };
    if (cost._count.invoiceItems > 0) return { error: 'payments.alreadyHasInvoice' };
    if (await numberInUse(owner.restaurantId, number, cost.id)) return { error: 'payments.numberInUse' };

    const vendor = !cost.vendorId && input.vendorName?.trim()
      ? await ensureVendor(owner.restaurantId, input.vendorName.trim().slice(0, 200))
      : null;

    await prisma.costEntry.update({
      where: { id: cost.id },
      data: { invoiceNumber: number, ...(vendor ? { vendorId: vendor.id } : {}) },
    });
    return { success: true as const };
  } catch (error: unknown) {
    return { error: toClientError('Failed to attach the invoice', error, 'write') };
  }
}

/**
 * A photographed invoice, attached to the cost that was entered before it
 * arrived. The invoice is the better record, so its date, total and supplier
 * replace what was typed; how it was paid stays as it was. The lines are then
 * identified exactly as for a new scan, against this cost.
 */
export async function attachScannedInvoice(input: {
  costEntryId: string;
  date: string;
  amount: number;
  vendorName: string;
  vendorTaxId?: string | null;
  invoiceNumber?: string | null;
}) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };

    if (!isDayKey(input.date)) return { error: 'payments.invalidDate' };
    if (!Number.isFinite(input.amount) || input.amount < 0.01 || input.amount > 999999) {
      return { error: 'payments.invalidAmount' };
    }

    const cost = await originalCost(owner.restaurantId, input.costEntryId);
    if (!cost) return { error: 'payments.notFound' };
    // A cost already split by its lines has an invoice; attaching another
    // would put two documents' money on one cost.
    if (cost._count.invoiceItems > 0 || cost._count.splitParts > 0) return { error: 'payments.alreadyHasInvoice' };

    const number = input.invoiceNumber?.trim().slice(0, 100) || null;
    if (number && number !== cost.invoiceNumber && (await numberInUse(owner.restaurantId, number, cost.id))) {
      return { error: 'payments.numberInUse' };
    }

    const vendor = await ensureVendor(owner.restaurantId, input.vendorName, input.vendorTaxId);
    await prisma.costEntry.update({
      where: { id: cost.id },
      data: {
        date: new Date(`${input.date}T00:00:00Z`),
        amount: Math.round(input.amount * 100) / 100,
        vendorId: vendor.id,
        ...(number ? { invoiceNumber: number } : {}),
      },
    });
    return { success: true as const, data: { id: cost.id } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to attach the invoice', error, 'write') };
  }
}

/** Suppliers on file, for the cost form: names to choose from and their terms. */
export async function getPaymentVendors() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };
    const vendors = await prisma.vendor.findMany({
      where: { restaurantId: owner.restaurantId, isActive: true },
      select: { id: true, name: true, paymentTermsDays: true },
      orderBy: { name: 'asc' },
    });
    return {
      success: true as const,
      data: vendors.map((v) => ({ id: v.id, name: v.name, termsDays: v.paymentTermsDays })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read the suppliers', error, 'read') };
  }
}
