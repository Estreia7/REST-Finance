import { weeklyMinutes } from './schedule';

/**
 * The staff time clock: people on the rota clock in and out on a tablet at
 * the restaurant with a four-digit PIN, and the owner sees the hours worked
 * against the hours scheduled.
 *
 * The rota's people have no account, so the PIN is the only thing that says
 * who is at the kiosk. It is stored as an HMAC keyed with the server secret:
 * a four-digit PIN is trivial to brute-force from a plain hash, but not
 * without the key. The HMAC is deterministic so it can be looked up, and
 * unique per restaurant so one PIN means one person.
 *
 * Pure, and tested in tests/time-clock.test.ts. The PIN hash is in
 * lib/time-clock-server.ts, away from the browser bundle.
 */

export const TIME_ZONE = 'Europe/Lisbon';

/** Set on a browser in kiosk mode. middleware.ts repeats the name rather than import it on the Edge. */
export const KIOSK_COOKIE = 'rf_kiosk';

/** An entry left open longer than this was a forgotten clock-out, not a shift. */
export const STALE_HOURS = 16;

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isStale(clockIn: Date, now: Date): boolean {
  return now.getTime() - clockIn.getTime() > STALE_HOURS * 3_600_000;
}

/** Whole minutes between in and out; null while the entry is still open. */
export function entryMinutes(clockIn: Date, clockOut: Date | null): number | null {
  if (!clockOut) return null;
  return Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000));
}

/** The Lisbon calendar day and minute of the day for an instant. */
export function lisbonParts(at: Date): { dateKey: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * The instant for a Lisbon wall-clock time, which is what the owner types when
 * fixing a forgotten clock-out. Lisbon is UTC+0 or UTC+1, so the first guess
 * is corrected by however far its own Lisbon reading is off.
 */
export function lisbonToUtc(dateKey: string, minutes: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const seen = lisbonParts(new Date(guess));
  const [sy, sm, sd] = seen.dateKey.split('-').map(Number);
  const seenAt = Date.UTC(sy, sm - 1, sd) + seen.minutes * 60_000;
  const wanted = Date.UTC(y, m - 1, d) + minutes * 60_000;
  return new Date(guess - (seenAt - wanted));
}

export interface ClockRow {
  employeeId: string;
  scheduledMin: number;
  workedMin: number;
  /** worked − scheduled: positive is overtime, negative is short. */
  diffMin: number;
  /** Clocked in right now. */
  inSince: string | null;
  /** Entries left open past STALE_HOURS: hours the owner has to fill in. */
  missingOut: number;
}

/**
 * The month per person. Open entries count for nothing until closed: guessing
 * a clock-out would put invented hours on a record that may decide pay.
 */
export function monthSummary(input: {
  employees: Array<{ id: string }>;
  shifts: Array<{ employeeId: string; startMin: number; endMin: number; breakStartMin?: number | null; breakEndMin?: number | null }>;
  entries: Array<{ employeeId: string; clockIn: Date; clockOut: Date | null }>;
  now: Date;
}): ClockRow[] {
  const scheduled = weeklyMinutes(input.shifts);
  return input.employees.map((e) => {
    let worked = 0;
    let inSince: string | null = null;
    let missingOut = 0;
    for (const entry of input.entries) {
      if (entry.employeeId !== e.id) continue;
      const mins = entryMinutes(entry.clockIn, entry.clockOut);
      if (mins !== null) worked += mins;
      else if (isStale(entry.clockIn, input.now)) missingOut++;
      else inSince = entry.clockIn.toISOString();
    }
    const scheduledMin = scheduled.get(e.id) ?? 0;
    return { employeeId: e.id, scheduledMin, workedMin: worked, diffMin: worked - scheduledMin, inSince, missingOut };
  });
}
