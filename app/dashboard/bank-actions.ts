'use server';

import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { decodeExport } from '@/lib/zonesoft-import';
import { dueDateFor, toDayKey } from '@/lib/payments';
import { normaliseName } from '@/lib/onboarding';
import {
  parseStatementText, parseStatementRows, lineHashes, StatementFormatError, type ParsedStatement,
} from '@/lib/bank-statement';
import {
  classifyMove, suggestMatches, autoMatches, methodFromDescription,
  type OpenCost, type BankMove, type MatchSuggestion,
} from '@/lib/bank-matching';

/**
 * Bank statements: import, match to invoices, confirm.
 *
 * The owner's statement is matched against the open invoices of every
 * restaurant they own, because one account often pays for two houses. A
 * confirmed match marks the invoices paid on the day the money left, in the
 * way the bank says it left. Errors are dictionary keys.
 */

function fail(error: string) {
  return { success: false as const, error };
}

const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function ownedRestaurants(userId: string) {
  return prisma.membership.findMany({
    where: { userId, role: 'OWNER', active: true },
    select: { restaurantId: true, restaurant: { select: { name: true } } },
  });
}

// ── Import ──────────────────────────────────────────────────────────────────

async function readStatement(bytes: Uint8Array): Promise<ParsedStatement> {
  // A legacy binary .xls: the bank can export CSV or .xlsx instead.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new StatementFormatError('bank.errors.legacyXls');
  }
  // .xlsx is a zip.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new StatementFormatError('bank.errors.empty');
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const out: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        out[col - 1] = v && typeof v === 'object' && 'result' in v ? v.result : v;
      });
      rows.push(out);
    });
    return parseStatementRows(rows);
  }
  return parseStatementText(decodeExport(bytes));
}

export async function importBankStatement(formData: FormData) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return fail('bank.errors.noFile');
    if (file.size > MAX_BYTES) return fail('bank.errors.tooLarge');

    let parsed: ParsedStatement;
    try {
      parsed = await readStatement(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      if (e instanceof StatementFormatError) return fail(e.key);
      throw e;
    }

    const hashes = lineHashes(parsed.lines);
    const created = await prisma.bankTransaction.createMany({
      data: parsed.lines.map((l, i) => ({
        restaurantId: owner.restaurantId,
        date: new Date(`${l.dateKey}T00:00:00Z`),
        amount: l.amount,
        description: l.description.slice(0, 500),
        balance: l.balance,
        kind: classifyMove(l),
        importHash: hashes[i],
        importedById: owner.userId,
      })),
      skipDuplicates: true,
    });

    revalidatePath('/dashboard');
    return {
      success: true as const,
      data: {
        added: created.count,
        alreadyThere: parsed.lines.length - created.count,
        skipped: parsed.skipped,
      },
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to import the bank statement', error, 'write'));
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Every unpaid invoice the owner has, in any of their restaurants. */
async function openCosts(restaurantIds: string[]): Promise<OpenCost[]> {
  const rows = await prisma.costEntry.findMany({
    where: { restaurantId: { in: restaurantIds }, deletedAt: null, splitFromId: null, paidAt: null },
    select: {
      id: true, restaurantId: true, date: true, dueDate: true, amount: true, description: true, invoiceNumber: true,
      vendor: { select: { id: true, name: true, paymentTermsDays: true } },
      splitParts: { where: { deletedAt: null }, select: { amount: true } },
      invoiceItems: { select: { invoiceNumber: true }, take: 1 },
    },
  });
  return rows.map((e) => {
    const dateKey = toDayKey(e.date);
    return {
      id: e.id,
      restaurantId: e.restaurantId,
      dateKey,
      dueKey: dueDateFor({
        dateKey,
        dueKey: e.dueDate ? toDayKey(e.dueDate) : null,
        hasVendor: !!e.vendor,
        termsDays: e.vendor?.paymentTermsDays,
      }),
      amount: cents(Number(e.amount) + e.splitParts.reduce((s, p) => s + Number(p.amount), 0)),
      vendorId: e.vendor?.id ?? null,
      vendorName: e.vendor?.name ?? null,
      invoiceNumber: e.invoiceNumber?.trim() || e.invoiceItems[0]?.invoiceNumber?.trim() || null,
      description: e.description,
    };
  });
}

export type BankFilter = 'open' | 'matched' | 'ignored' | 'all';

export interface BankRow {
  id: string;
  dateKey: string;
  amount: number;
  description: string;
  kind: 'PAYMENT' | 'INCOME' | 'FEE' | 'CASH';
  status: 'OPEN' | 'MATCHED' | 'IGNORED';
  suggestion: (MatchSuggestion & { costs: CostLabel[] }) | null;
  matched: CostLabel[];
}

export interface CostLabel {
  id: string;
  dateKey: string;
  amount: number;
  vendorName: string | null;
  invoiceNumber: string | null;
  description: string | null;
  /** Set when the invoice belongs to another of the owner's restaurants. */
  restaurantName: string | null;
}

export async function getBankView(filter: BankFilter = 'open') {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);

    const owned = await ownedRestaurants(owner.userId);
    const names = new Map(owned.map((m) => [m.restaurantId, m.restaurant.name]));
    const label = (c: OpenCost | (Omit<OpenCost, 'dueKey' | 'vendorId'>)): CostLabel => ({
      id: c.id,
      dateKey: c.dateKey,
      amount: c.amount,
      vendorName: c.vendorName,
      invoiceNumber: c.invoiceNumber,
      description: c.description,
      restaurantName: c.restaurantId === owner.restaurantId ? null : names.get(c.restaurantId) ?? null,
    });

    const [txs, costs, totals] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          restaurantId: owner.restaurantId,
          ...(filter === 'all' ? {} : { status: filter === 'open' ? 'OPEN' : filter === 'matched' ? 'MATCHED' : 'IGNORED' }),
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 300,
        include: {
          matches: {
            include: {
              costEntry: {
                select: {
                  id: true, restaurantId: true, date: true, amount: true, description: true, invoiceNumber: true,
                  vendor: { select: { name: true } },
                  splitParts: { where: { deletedAt: null }, select: { amount: true } },
                },
              },
            },
          },
        },
      }),
      openCosts(owned.map((m) => m.restaurantId)),
      prisma.bankTransaction.groupBy({
        by: ['status', 'kind'],
        where: { restaurantId: owner.restaurantId },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const byId = new Map(costs.map((c) => [c.id, c]));
    const rows: BankRow[] = txs.map((t) => {
      const move: BankMove = { id: t.id, dateKey: toDayKey(t.date), amount: Number(t.amount), description: t.description };
      const best = t.status === 'OPEN' && t.kind === 'PAYMENT' ? suggestMatches(move, costs)[0] ?? null : null;
      return {
        id: t.id,
        dateKey: move.dateKey,
        amount: move.amount,
        description: t.description,
        kind: t.kind,
        status: t.status,
        suggestion: best ? { ...best, costs: best.costIds.map((id) => label(byId.get(id)!)) } : null,
        matched: t.matches.map((m) => label({
          id: m.costEntry.id,
          restaurantId: m.costEntry.restaurantId,
          dateKey: toDayKey(m.costEntry.date),
          amount: cents(Number(m.costEntry.amount) + m.costEntry.splitParts.reduce((s, p) => s + Number(p.amount), 0)),
          vendorName: m.costEntry.vendor?.name ?? null,
          invoiceNumber: m.costEntry.invoiceNumber,
          description: m.costEntry.description,
        })),
      };
    });

    const sum = (status: string, kind?: string) => totals
      .filter((g) => g.status === status && (!kind || g.kind === kind))
      .reduce((a, g) => ({ count: a.count + g._count._all, total: cents(a.total + Number(g._sum.amount ?? 0)) }), { count: 0, total: 0 });

    // What "reconcile automatically" would confirm right now.
    const openMoves = await prisma.bankTransaction.findMany({
      where: { restaurantId: owner.restaurantId, status: 'OPEN', kind: 'PAYMENT' },
      select: { id: true, date: true, amount: true, description: true },
    });
    const auto = autoMatches(
      openMoves.map((m) => ({ id: m.id, dateKey: toDayKey(m.date), amount: Number(m.amount), description: m.description })),
      costs,
    );

    return {
      success: true as const,
      data: {
        rows,
        summary: {
          openPayments: sum('OPEN', 'PAYMENT'),
          openFees: sum('OPEN', 'FEE'),
          open: sum('OPEN'),
          matched: sum('MATCHED'),
          ignored: sum('IGNORED'),
          autoCount: auto.length,
        },
      },
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read the bank movements', error, 'read'));
  }
}

/** Open invoices to pick from by hand, closest in amount first. */
export async function getMatchCandidates(input: { transactionId: string; search?: string }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    if (!UUID.test(input.transactionId)) return fail('bank.errors.notFound');

    const tx = await prisma.bankTransaction.findFirst({
      where: { id: input.transactionId, restaurantId: owner.restaurantId },
      select: { amount: true },
    });
    if (!tx) return fail('bank.errors.notFound');

    const owned = await ownedRestaurants(owner.userId);
    const names = new Map(owned.map((m) => [m.restaurantId, m.restaurant.name]));
    const target = Math.abs(Number(tx.amount));
    const term = normaliseName(input.search ?? '');
    const costs = (await openCosts(owned.map((m) => m.restaurantId)))
      .filter((c) => !term || normaliseName(`${c.vendorName ?? ''} ${c.invoiceNumber ?? ''} ${c.description ?? ''}`).includes(term))
      .sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target))
      .slice(0, 40);

    return {
      success: true as const,
      data: costs.map((c): CostLabel => ({
        id: c.id, dateKey: c.dateKey, amount: c.amount, vendorName: c.vendorName,
        invoiceNumber: c.invoiceNumber, description: c.description,
        restaurantName: c.restaurantId === owner.restaurantId ? null : names.get(c.restaurantId) ?? null,
      })),
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to list invoices to match', error, 'read'));
  }
}

// ── Confirming ──────────────────────────────────────────────────────────────

/**
 * Pays the invoices with the movement: each is marked paid on the day the
 * money left, the way the bank says it left. Only open movements of this
 * restaurant, and only unpaid invoices of restaurants this owner holds.
 */
async function confirm(ownerUserId: string, restaurantId: string, transactionId: string, costIds: string[]) {
  const owned = await ownedRestaurants(ownerUserId);
  return prisma.$transaction(async (db) => {
    const tx = await db.bankTransaction.findFirst({
      where: { id: transactionId, restaurantId, status: 'OPEN' },
      select: { id: true, date: true, description: true },
    });
    if (!tx) return 'bank.errors.notFound';

    const costs = await db.costEntry.findMany({
      where: {
        id: { in: costIds },
        restaurantId: { in: owned.map((m) => m.restaurantId) },
        deletedAt: null,
        splitFromId: null,
        paidAt: null,
      },
      select: { id: true },
    });
    if (costs.length !== costIds.length) return 'bank.errors.costGone';

    await db.costEntry.updateMany({
      where: { id: { in: costIds } },
      data: { paidAt: tx.date, paymentMethod: methodFromDescription(tx.description) },
    });
    await db.bankMatch.createMany({ data: costIds.map((costEntryId) => ({ bankTransactionId: tx.id, costEntryId })) });
    await db.bankTransaction.update({ where: { id: tx.id }, data: { status: 'MATCHED', matchedAt: new Date() } });
    return null;
  });
}

export async function confirmBankMatch(input: { transactionId: string; costIds: string[] }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const ids = [...new Set(input.costIds)].filter((id) => UUID.test(id));
    if (!UUID.test(input.transactionId) || ids.length === 0 || ids.length > 20) return fail('bank.errors.notFound');

    const error = await confirm(owner.userId, owner.restaurantId, input.transactionId, ids);
    if (error) return fail(error);
    revalidatePath('/dashboard');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to confirm the match', error, 'write'));
  }
}

/** Confirms every certain match at once. Never a guess: see autoMatches. */
export async function autoReconcile() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);

    const owned = await ownedRestaurants(owner.userId);
    const [moves, costs] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { restaurantId: owner.restaurantId, status: 'OPEN', kind: 'PAYMENT' },
        select: { id: true, date: true, amount: true, description: true },
      }),
      openCosts(owned.map((m) => m.restaurantId)),
    ]);
    const pairs = autoMatches(
      moves.map((m) => ({ id: m.id, dateKey: toDayKey(m.date), amount: Number(m.amount), description: m.description })),
      costs,
    );

    let matched = 0;
    for (const p of pairs) {
      if (!(await confirm(owner.userId, owner.restaurantId, p.moveId, p.costIds))) matched++;
    }
    revalidatePath('/dashboard');
    return { success: true as const, data: { matched } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to reconcile', error, 'write'));
  }
}

/** Not an invoice payment (a transfer between own accounts, a refund): set aside. */
export async function setBankIgnored(input: { transactionId: string; ignored: boolean }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const updated = await prisma.bankTransaction.updateMany({
      where: { id: input.transactionId, restaurantId: owner.restaurantId, status: input.ignored ? 'OPEN' : 'IGNORED' },
      data: { status: input.ignored ? 'IGNORED' : 'OPEN' },
    });
    if (updated.count === 0) return fail('bank.errors.notFound');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to update the movement', error, 'write'));
  }
}

/**
 * Undoes a match: the invoices go back to unpaid, unless something else has
 * changed them since, and the movement back to open. A bank charge booked
 * from the movement was the movement's own expense, so it is removed instead.
 */
export async function undoBankMatch(transactionId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);

    const done = await prisma.$transaction(async (db) => {
      const tx = await db.bankTransaction.findFirst({
        where: { id: transactionId, restaurantId: owner.restaurantId, status: 'MATCHED' },
        select: { id: true, date: true, kind: true, matches: { select: { costEntryId: true } } },
      });
      if (!tx) return false;
      const ids = tx.matches.map((m) => m.costEntryId);
      await db.bankMatch.deleteMany({ where: { bankTransactionId: tx.id } });
      if (tx.kind === 'FEE') {
        await db.costEntry.updateMany({
          where: { id: { in: ids }, restaurantId: owner.restaurantId },
          data: { deletedAt: new Date() },
        });
      } else {
        await db.costEntry.updateMany({
          where: { id: { in: ids }, paidAt: tx.date },
          data: { paidAt: null, paymentMethod: null },
        });
      }
      await db.bankTransaction.update({ where: { id: tx.id }, data: { status: 'OPEN', matchedAt: null } });
      return true;
    });
    if (!done) return fail('bank.errors.notFound');
    revalidatePath('/dashboard');
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to undo the match', error, 'write'));
  }
}

/**
 * Books bank charges as an expense, already paid, in the bank-fees category,
 * and marks the movements matched. Without this they are money gone that no
 * report ever shows.
 */
export async function bookBankFees(transactionIds: string[]) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const ids = transactionIds.filter((id) => UUID.test(id)).slice(0, 200);

    const moves = await prisma.bankTransaction.findMany({
      where: { id: { in: ids }, restaurantId: owner.restaurantId, status: 'OPEN', kind: 'FEE', amount: { lt: 0 } },
      select: { id: true, date: true, amount: true, description: true },
    });
    if (moves.length === 0) return { success: true as const, data: { booked: 0 } };

    const categories = await prisma.category.findMany({
      where: { restaurantId: owner.restaurantId, type: 'OPEX', isActive: true },
      select: { id: true, name: true },
    });
    const feeCategory = categories.find((c) => /bank|banc|comiss/.test(normaliseName(c.name)))?.id ?? null;

    await prisma.$transaction(async (db) => {
      for (const m of moves) {
        const cost = await db.costEntry.create({
          data: {
            restaurantId: owner.restaurantId,
            date: m.date,
            type: 'OPEX',
            categoryId: feeCategory,
            amount: Math.abs(Number(m.amount)),
            description: m.description.slice(0, 200),
            createdById: owner.userId,
            paidAt: m.date,
            paymentMethod: 'DIRECT_DEBIT',
          },
          select: { id: true },
        });
        await db.bankMatch.create({ data: { bankTransactionId: m.id, costEntryId: cost.id } });
        await db.bankTransaction.update({ where: { id: m.id }, data: { status: 'MATCHED', matchedAt: new Date() } });
      }
    });
    revalidatePath('/dashboard');
    return { success: true as const, data: { booked: moves.length } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to book the bank charges', error, 'write'));
  }
}
