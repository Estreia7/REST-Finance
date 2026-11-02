'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError, refuseWhileImpersonating } from '@/lib/auth-helpers';
import { toClientError } from '@/lib/errors';
import { moduleOff } from '@/lib/modules-server';
import { hashPin, randomPin } from '@/lib/time-clock-server';
import { KIOSK_COOKIE, monthSummary, lisbonToUtc, lisbonParts } from '@/lib/time-clock';

/**
 * The owner's side of the time clock: PINs, the month's hours against the
 * rota, and fixing what the kiosk could not know (a forgotten clock-out).
 * The kiosk itself lives in app/kiosk. Errors are dictionary keys.
 */

function fail(error: string) {
  return { success: false as const, error };
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET must be set for kiosk PINs.');
  return s;
}

function monthRange(month: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

export async function getClockMonth(month: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const off = await moduleOff(owner.restaurantId, 'timeClock');
    if (off) return fail(off);
    const range = monthRange(month);
    if (!range) return fail('clock.errors.invalid');
    const now = new Date();
    // Entries are fetched a day either side: the month is a Lisbon month, and
    // an entry at 23:30 on the last day is in it even though it is 00:30 UTC
    // or later. The exact cut is made on the Lisbon day below.
    const [employees, shifts, rawEntries] = await Promise.all([
      prisma.scheduleEmployee.findMany({
        where: { restaurantId: owner.restaurantId, deletedAt: null },
        orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, role: true, color: true, active: true, pinHash: true },
      }),
      prisma.shift.findMany({
        where: { restaurantId: owner.restaurantId, date: { gte: range.from, lt: range.to } },
        select: { employeeId: true, startMin: true, endMin: true, breakStartMin: true, breakEndMin: true },
      }),
      prisma.timeEntry.findMany({
        where: {
          restaurantId: owner.restaurantId,
          clockIn: { gte: new Date(range.from.getTime() - 86_400_000), lt: new Date(range.to.getTime() + 86_400_000) },
        },
        orderBy: { clockIn: 'asc' },
        select: { id: true, employeeId: true, clockIn: true, clockOut: true, source: true, editedAt: true },
      }),
    ]);
    const entries = rawEntries.filter((e) => lisbonParts(e.clockIn).dateKey.slice(0, 7) === month);
    // People who have left still show while they have hours in the month.
    const shown = employees.filter((e) => e.active || entries.some((x) => x.employeeId === e.id));
    const rows = monthSummary({ employees: shown, shifts, entries, now });
    return {
      success: true as const,
      data: {
        people: shown.map((e, i) => ({ id: e.id, name: e.name, role: e.role, color: e.color, hasPin: !!e.pinHash, ...rows[i] })),
        entries: entries.map((e) => ({
          id: e.id,
          employeeId: e.employeeId,
          clockIn: e.clockIn.toISOString(),
          clockOut: e.clockOut?.toISOString() ?? null,
          manual: e.source === 'manual' || !!e.editedAt,
        })),
      },
    };
  } catch (error: unknown) {
    return fail(toClientError('Failed to read the time clock', error, 'read'));
  }
}

/**
 * A fresh PIN for one person, shown to the owner once. Only its HMAC is
 * stored, so a forgotten PIN is replaced, never looked up.
 */
export async function setEmployeePin(employeeId: string) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const off = await moduleOff(owner.restaurantId, 'timeClock');
    if (off) return fail(off);
    const refused = refuseWhileImpersonating(owner);
    if (refused) return refused;
    const employee = await prisma.scheduleEmployee.findFirst({
      where: { id: employeeId, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return fail('clock.errors.notFound');
    for (let attempt = 0; attempt < 25; attempt++) {
      const pin = randomPin();
      try {
        await prisma.scheduleEmployee.update({ where: { id: employee.id }, data: { pinHash: hashPin(owner.restaurantId, pin, secret()) } });
        return { success: true as const, data: { pin } };
      } catch (error: unknown) {
        // Someone else at this restaurant has that PIN: draw another.
        if ((error as { code?: string })?.code === 'P2002') continue;
        throw error;
      }
    }
    return fail('clock.errors.noPinFree');
  } catch (error: unknown) {
    return fail(toClientError('Failed to set the PIN', error, 'write'));
  }
}

/**
 * Adds an entry the kiosk missed, or corrects one: a Lisbon day and times as
 * the owner reads them off a wall clock. An out at or before the in runs into
 * the next day, as a close does. Every change records who made it.
 */
export async function saveTimeEntry(input: { id?: string; employeeId: string; date: string; inMin: number; outMin: number | null }) {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const off = await moduleOff(owner.restaurantId, 'timeClock');
    if (off) return fail(off);
    const refused = refuseWhileImpersonating(owner);
    if (refused) return refused;
    const okMin = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1440;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !okMin(input.inMin) || (input.outMin !== null && !okMin(input.outMin))) {
      return fail('clock.errors.invalid');
    }
    const employee = await prisma.scheduleEmployee.findFirst({
      where: { id: input.employeeId, restaurantId: owner.restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return fail('clock.errors.notFound');

    const clockIn = lisbonToUtc(input.date, input.inMin);
    let clockOut: Date | null = null;
    if (input.outMin !== null) {
      clockOut = lisbonToUtc(input.date, input.outMin);
      if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 86_400_000);
    }
    if (clockIn > new Date() || (clockOut && clockOut > new Date(Date.now() + 5 * 60_000))) return fail('clock.errors.future');

    const audit = { editedById: owner.userId, editedAt: new Date() };
    if (input.id) {
      const updated = await prisma.timeEntry.updateMany({
        where: { id: input.id, restaurantId: owner.restaurantId, employeeId: employee.id },
        data: { clockIn, clockOut, ...audit },
      });
      if (updated.count === 0) return fail('clock.errors.notFound');
    } else {
      await prisma.timeEntry.create({
        data: { restaurantId: owner.restaurantId, employeeId: employee.id, clockIn, clockOut, source: 'manual', ...audit },
      });
    }
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to save the entry', error, 'write'));
  }
}

/** Puts this browser into kiosk mode: until the owner leaves it, it only shows the PIN pad. */
export async function openKiosk() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return fail(owner.error);
    const off = await moduleOff(owner.restaurantId, 'timeClock');
    if (off) return fail(off);
    const refused = refuseWhileImpersonating(owner);
    if (refused) return refused;
    cookies().set(KIOSK_COOKIE, owner.restaurantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to open the kiosk', error, 'write'));
  }
}
