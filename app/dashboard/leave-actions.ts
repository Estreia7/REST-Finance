'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { dateKey, parseDateKey } from '@/lib/schedule';

/**
 * Holidays for the people on the rota.
 *
 * Owner-only, like the rota itself: who is away and for how long is the
 * owner's business, and the people concerned have no account anyway.
 *
 * The server stores and validates; it does not count. Entitlement and the
 * balance are worked out by `lib/leave.ts` in the panel, from the same rows,
 * so the arithmetic lives in one tested place rather than being duplicated
 * here and drifting.
 *
 * Errors are dictionary keys, never sentences: there is no language here.
 */

/** A single booking longer than a quarter is a typo, not a holiday. */
const MAX_LEAVE_SPAN_DAYS = 92;

function fail(error: string) {
  return { success: false as const, error };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD`, or null. */
function readDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return null;
  const date = parseDateKey(value);
  // Rejects 2026-02-31, which Date would quietly roll into March.
  return Number.isNaN(date.getTime()) || dateKey(date) !== value ? null : date;
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * Everything the holiday panel needs for one year.
 *
 * Bookings are read from six years back: the balance walks forward from the
 * year someone joined to work out what carried over, and a carry never
 * reaches further than one year, so six is generous.
 */
export async function getLeaveOverview(year: number) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('leave.invalidYear');

  const from = new Date(Date.UTC(year - 6, 0, 1));
  // To the end of January next year, so a booking straddling New Year shows
  // in December's calendar whole.
  const to = new Date(Date.UTC(year + 1, 0, 31));

  const [employees, leaves, first] = await Promise.all([
    prisma.scheduleEmployee.findMany({
      where: { restaurantId: owner.restaurantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, role: true, color: true, startDate: true },
    }),
    prisma.employeeLeave.findMany({
      where: {
        restaurantId: owner.restaurantId,
        startDate: { lte: to },
        endDate: { gte: from },
        employee: { deletedAt: null },
      },
      orderBy: { startDate: 'asc' },
      select: { id: true, employeeId: true, startDate: true, endDate: true, note: true },
    }),
    // The first holiday ever recorded: nothing carries in from before it.
    prisma.employeeLeave.findFirst({
      where: { restaurantId: owner.restaurantId },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    }),
  ]);

  return {
    success: true as const,
    data: {
      year,
      trackedFromYear: first ? first.startDate.getUTCFullYear() : year,
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        color: e.color,
        startDate: e.startDate ? dateKey(e.startDate) : null,
      })),
      leaves: leaves.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        start: dateKey(l.startDate),
        end: dateKey(l.endDate),
        note: l.note,
      })),
    },
  };
}

// ── Writing ────────────────────────────────────────────────────────────────

/**
 * Books a holiday, or changes one (`id` given).
 *
 * Shifts already on the rota for those days are not silently dropped: the
 * first call reports how many there are, and only a second call with
 * `replaceShifts` removes them. Someone who arranged the week should see that
 * it is about to change.
 */
export async function saveLeave(input: {
  id?: string;
  employeeId: string;
  start: string;
  end: string;
  note?: string | null;
  replaceShifts?: boolean;
}) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const start = readDate(input.start);
  const end = readDate(input.end);
  if (!start || !end) return fail('leave.invalidDate');
  if (end < start) return fail('leave.endBeforeStart');
  if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > MAX_LEAVE_SPAN_DAYS) {
    return fail('leave.tooLong');
  }

  const employee = await prisma.scheduleEmployee.findFirst({
    where: { id: input.employeeId, restaurantId: owner.restaurantId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return fail('leave.employeeNotFound');

  if (input.id) {
    const existing = await prisma.employeeLeave.findFirst({
      where: { id: input.id, restaurantId: owner.restaurantId },
      select: { id: true },
    });
    if (!existing) return fail('leave.notFound');
  }

  // Two bookings over the same days would count those days twice in every
  // place that adds bookings up by hand — the accountant's included.
  const overlap = await prisma.employeeLeave.findFirst({
    where: {
      restaurantId: owner.restaurantId,
      employeeId: input.employeeId,
      startDate: { lte: end },
      endDate: { gte: start },
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { id: true },
  });
  if (overlap) return fail('leave.overlaps');

  const shiftsInRange = {
    restaurantId: owner.restaurantId,
    employeeId: input.employeeId,
    date: { gte: start, lte: end },
  };

  if (!input.replaceShifts) {
    const shiftCount = await prisma.shift.count({ where: shiftsInRange });
    if (shiftCount > 0) {
      return { success: false as const, error: 'leave.shiftsConflict', conflict: true as const, shiftCount };
    }
  }

  const data = {
    employeeId: input.employeeId,
    startDate: start,
    endDate: end,
    note: input.note?.trim().slice(0, 80) || null,
  };

  await prisma.$transaction([
    prisma.shift.deleteMany({ where: shiftsInRange }),
    input.id
      ? prisma.employeeLeave.update({ where: { id: input.id }, data })
      : prisma.employeeLeave.create({ data: { ...data, restaurantId: owner.restaurantId } }),
  ]);

  return { success: true as const };
}

export async function removeLeave(id: string) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const { count } = await prisma.employeeLeave.deleteMany({
    where: { id, restaurantId: owner.restaurantId },
  });
  if (count === 0) return fail('leave.notFound');

  return { success: true as const };
}

/** The day someone's contract started, which sets their first year's days. */
export async function setEmployeeStartDate(employeeId: string, value: string | null) {
  const owner = await requireOwner();
  if (isAuthError(owner)) return fail(owner.error);

  const startDate = value === null || value === '' ? null : readDate(value);
  if (value && !startDate) return fail('leave.invalidDate');

  const { count } = await prisma.scheduleEmployee.updateMany({
    where: { id: employeeId, restaurantId: owner.restaurantId, deletedAt: null },
    data: { startDate },
  });
  if (count === 0) return fail('leave.employeeNotFound');

  return { success: true as const };
}
