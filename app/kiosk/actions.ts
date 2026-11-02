'use server';

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireMember, isAuthError } from '@/lib/auth-helpers';
import { signOut } from '@/lib/auth-config';
import { toClientError } from '@/lib/errors';
import { moduleOff } from '@/lib/modules-server';
import { hashPin } from '@/lib/time-clock-server';
import { KIOSK_COOKIE, isValidPin, isStale } from '@/lib/time-clock';

/**
 * The kiosk: a tablet at the door, signed in as the owner, that only shows a
 * PIN pad. Punches are accepted only from a browser the owner put in kiosk
 * mode, and leaving it takes the owner's password. Errors are dictionary keys.
 */

function fail(error: string) {
  return { success: false as const, error };
}

/**
 * Wrong PINs per restaurant. Five in five minutes locks the pad for five
 * minutes: enough for fumbled fingers at a shift change, far too slow to try
 * ten thousand PINs. In memory, which suits the single app process.
 */
const failures = new Map<string, { count: number; first: number; lockedUntil: number }>();
const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;

function locked(key: string, now: number): boolean {
  return (failures.get(key)?.lockedUntil ?? 0) > now;
}

function recordFailure(key: string, now: number) {
  const f = failures.get(key);
  if (!f || now - f.first > WINDOW_MS) {
    failures.set(key, { count: 1, first: now, lockedUntil: 0 });
    return;
  }
  f.count++;
  if (f.count >= MAX_FAILURES) f.lockedUntil = now + WINDOW_MS;
}

async function kioskMember() {
  const member = await requireMember();
  if (isAuthError(member)) return { error: member.error };
  if (cookies().get(KIOSK_COOKIE)?.value !== member.restaurantId) return { error: 'kiosk.errors.notKiosk' };
  return member;
}

export async function kioskPunch(pin: string) {
  try {
    const member = await kioskMember();
    if ('error' in member) return fail(member.error);
    const off = await moduleOff(member.restaurantId, 'timeClock');
    if (off) return fail(off);
    const key = `kiosk:${member.restaurantId}`;
    const nowMs = Date.now();
    if (locked(key, nowMs)) return fail('kiosk.errors.locked');
    if (!isValidPin(pin)) return fail('kiosk.errors.wrongPin');

    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET must be set for kiosk PINs.');
    const employee = await prisma.scheduleEmployee.findFirst({
      where: { restaurantId: member.restaurantId, pinHash: hashPin(member.restaurantId, pin, secret), active: true, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!employee) {
      recordFailure(key, nowMs);
      return fail(locked(key, nowMs) ? 'kiosk.errors.locked' : 'kiosk.errors.wrongPin');
    }

    const now = new Date(nowMs);
    const open = await prisma.timeEntry.findFirst({
      where: { employeeId: employee.id, clockOut: null },
      orderBy: { clockIn: 'desc' },
      select: { id: true, clockIn: true },
    });

    // A second tap within a minute of clocking in is the same arrival, not a
    // zero-minute shift.
    if (open && nowMs - open.clockIn.getTime() < 60_000) {
      return { success: true as const, data: { name: employee.name, action: 'in' as const, at: open.clockIn.toISOString(), minutes: null } };
    }
    // An entry open for longer than a shift was a forgotten clock-out. It
    // stays open for the owner to fill in, and this tap starts a new day.
    if (open && !isStale(open.clockIn, now)) {
      await prisma.timeEntry.update({ where: { id: open.id }, data: { clockOut: now } });
      const minutes = Math.round((nowMs - open.clockIn.getTime()) / 60_000);
      return { success: true as const, data: { name: employee.name, action: 'out' as const, at: now.toISOString(), minutes } };
    }
    await prisma.timeEntry.create({ data: { restaurantId: member.restaurantId, employeeId: employee.id, clockIn: now } });
    return { success: true as const, data: { name: employee.name, action: 'in' as const, at: now.toISOString(), minutes: null } };
  } catch (error: unknown) {
    return fail(toClientError('Failed to clock in or out', error, 'write'));
  }
}

/** Leaves kiosk mode with the password of the account the tablet is signed in to. */
export async function exitKiosk(password: string) {
  try {
    const member = await kioskMember();
    if ('error' in member) return fail(member.error);
    const key = `kiosk-exit:${member.restaurantId}`;
    const nowMs = Date.now();
    if (locked(key, nowMs)) return fail('kiosk.errors.locked');
    const user = await prisma.user.findUnique({ where: { id: member.userId }, select: { passwordHash: true } });
    if (!user?.passwordHash) return fail('kiosk.errors.noPassword');
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      recordFailure(key, nowMs);
      return fail('kiosk.errors.wrongPassword');
    }
    cookies().delete(KIOSK_COOKIE);
    return { success: true as const };
  } catch (error: unknown) {
    return fail(toClientError('Failed to leave the kiosk', error, 'write'));
  }
}

/**
 * For an account that signs in with Google and has no password: leaving the
 * kiosk signs the tablet out, so getting back to the numbers still takes the
 * owner's own sign-in.
 */
export async function exitKioskBySigningOut() {
  cookies().delete(KIOSK_COOKIE);
  await signOut({ redirectTo: '/login' });
}
