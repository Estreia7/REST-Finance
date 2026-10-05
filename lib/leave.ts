/**
 * Holiday entitlement under the Portuguese Código do Trabalho.
 *
 * Pure, like the rota arithmetic it sits beside: given dates, it returns
 * numbers. The parts that go wrong in holiday tracking are the calendar ones —
 * Easter moving, a booking that crosses New Year, the year someone joins — and
 * none of them need a database to test.
 *
 * The rules, as applied here:
 *   - 22 working days a year (art. 238.º), earned on 1 January.
 *   - "Working days" are Monday to Friday, public holidays excluded
 *     (art. 238.º n.º 2) — for a restaurant too, even though it opens at the
 *     weekend. A week off from Monday to Sunday uses five days.
 *   - In the year someone joins: 2 working days per complete month of
 *     contract, up to 20, usable once six months have passed (art. 239.º).
 *     If the year ends first, they can be used until 30 June of the next.
 *     That following year may not total more than 30 days.
 *   - Days left over can be used until 30 April of the following year
 *     (art. 240.º n.º 2).
 *
 * National holidays only. The municipal holiday and Carnival are a matter for
 * each employer, and the regional ones of the islands are not modelled.
 */

import { addDays, dateKey, parseDateKey } from './schedule';

export const ANNUAL_LEAVE_DAYS = 22;
/** The most the joining year can earn: 2 days × 10 months. */
export const ADMISSION_YEAR_CAP = 20;
/** The most that can be taken in the year after joining, carried days included. */
export const YEAR_AFTER_ADMISSION_CAP = 30;

// ── Public holidays ────────────────────────────────────────────────────────

export type HolidayKey =
  | 'newYear' | 'goodFriday' | 'easter' | 'freedom' | 'labour' | 'corpusChristi'
  | 'portugal' | 'assumption' | 'republic' | 'allSaints' | 'restoration'
  | 'immaculate' | 'christmas';

export interface Holiday {
  date: string;
  key: HolidayKey;
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 *
 * Good Friday and Corpus Christi hang off it, so a wrong Easter moves two
 * holidays and quietly miscounts every booking near them.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The thirteen national holidays (art. 234.º), in date order. */
export function portugueseHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const fixed = (month: number, day: number, key: HolidayKey): Holiday => ({
    date: dateKey(new Date(Date.UTC(year, month - 1, day))),
    key,
  });

  return [
    fixed(1, 1, 'newYear'),
    { date: dateKey(addDays(easter, -2)), key: 'goodFriday' as const },
    { date: dateKey(easter), key: 'easter' as const },
    fixed(4, 25, 'freedom'),
    fixed(5, 1, 'labour'),
    { date: dateKey(addDays(easter, 60)), key: 'corpusChristi' as const },
    fixed(6, 10, 'portugal'),
    fixed(8, 15, 'assumption'),
    fixed(10, 5, 'republic'),
    fixed(11, 1, 'allSaints'),
    fixed(12, 1, 'restoration'),
    fixed(12, 8, 'immaculate'),
    fixed(12, 25, 'christmas'),
  ].sort((x, y) => x.date.localeCompare(y.date));
}

const holidayCache = new Map<number, Map<string, HolidayKey>>();

/** The holiday on a date, if there is one. */
export function holidayOn(key: string): HolidayKey | null {
  const year = Number(key.slice(0, 4));
  let byDate = holidayCache.get(year);
  if (!byDate) {
    byDate = new Map(portugueseHolidays(year).map((h) => [h.date, h.key]));
    holidayCache.set(year, byDate);
  }
  return byDate.get(key) ?? null;
}

// ── Working days ───────────────────────────────────────────────────────────

/** Monday to Friday and not a public holiday: a day that counts as leave. */
export function isLeaveWorkingDay(key: string): boolean {
  const day = parseDateKey(key).getUTCDay();
  return day !== 0 && day !== 6 && holidayOn(key) === null;
}

/** Every date from `start` to `end`, both included. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const last = parseDateKey(end);
  for (let d = parseDateKey(start); d <= last; d = addDays(d, 1)) out.push(dateKey(d));
  return out;
}

/** The working days a booking from `start` to `end` uses. */
export function leaveWorkingDays(start: string, end: string): string[] {
  return datesBetween(start, end).filter(isLeaveWorkingDay);
}

// ── Entitlement ────────────────────────────────────────────────────────────

/**
 * `date` moved by whole months, with the day clamped to the month's end:
 * 31 January plus one month is 28 (or 29) February, not 3 March.
 */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

/** Complete months from `start` up to and including `end`. */
export function completeMonths(start: string, end: string): number {
  const from = parseDateKey(start);
  const until = parseDateKey(end);
  let months = 0;
  // A month is complete when the day before its anniversary has been worked:
  // 15 March completes its first month on 14 April.
  while (addDays(addMonths(from, months + 1), -1) <= until) months += 1;
  return months;
}

export interface YearEntitlement {
  /** Working days earned for this year. */
  days: number;
  /** Whether this is the year the person joined. */
  admissionYear: boolean;
  /** The first day the joining year's days may be used, six months in. */
  availableFrom: string | null;
}

/**
 * What a person earns for a calendar year.
 *
 * With no start date on file they are treated as having been there all along:
 * 22 days. That overstates nothing for the people already on the rota, who
 * were added before the field existed, and the panel asks for the date.
 */
export function entitlementFor(startDate: string | null, year: number): YearEntitlement {
  if (!startDate) return { days: ANNUAL_LEAVE_DAYS, admissionYear: false, availableFrom: null };

  const startYear = Number(startDate.slice(0, 4));
  if (year < startYear) return { days: 0, admissionYear: false, availableFrom: null };
  if (year > startYear) return { days: ANNUAL_LEAVE_DAYS, admissionYear: false, availableFrom: null };

  const months = completeMonths(startDate, `${year}-12-31`);
  return {
    days: Math.min(ADMISSION_YEAR_CAP, months * 2),
    admissionYear: true,
    availableFrom: dateKey(addMonths(parseDateKey(startDate), 6)),
  };
}

// ── Balance ────────────────────────────────────────────────────────────────

export interface LeaveRange {
  start: string;
  end: string;
}

export interface LeaveBalance {
  year: number;
  /** Earned for this year. */
  entitlement: number;
  /** Left over from last year and usable this year. */
  carried: number;
  /** Last day the carried days can be used; null when nothing carried. */
  carriedDeadline: string | null;
  /** Carried days that ran out unused, once the deadline has passed. */
  carriedExpired: number;
  /** Working days booked in this year, past and future. */
  booked: number;
  /** Of those, the ones already gone by. */
  taken: number;
  /** Still to book. Negative when more is booked than is due. */
  remaining: number;
  /** The joining year's six-month mark, while it is still relevant. */
  availableFrom: string | null;
  admissionYear: boolean;
  /** No start date on file, so the full 22 days were assumed. */
  startDateMissing: boolean;
}

/**
 * Where a person stands for `year`.
 *
 * Walked forward from the year they joined, because what carries into this
 * year depends on what was used last year, which in turn depended on what
 * carried into that. Booked days inside the carry window spend the carried
 * days first — they are the ones that expire.
 */
export function leaveBalance(input: {
  startDate: string | null;
  leaves: LeaveRange[];
  year: number;
  /** Today's date key; decides what has been taken and what has expired. */
  today: string;
  /**
   * The first year the restaurant recorded any holiday here. Nothing carries
   * in from before it: a year with no bookings because the app was not yet
   * in use is not a year in which 22 days went unused, and treating it as one
   * would show every person an extra 22 days each spring.
   */
  trackedFromYear?: number;
}): LeaveBalance {
  const { startDate, year, today } = input;

  if (startDate && Number(startDate.slice(0, 4)) > year) {
    // Not yet employed in this year: nothing due, nothing to show.
    return {
      year, entitlement: 0, carried: 0, carriedDeadline: null, carriedExpired: 0,
      booked: 0, taken: 0, remaining: 0, availableFrom: null, admissionYear: false,
      startDateMissing: false,
    };
  }

  // Each booked working day, once, grouped by year. A day booked twice (two
  // overlapping ranges) is still one day off.
  const daysByYear = new Map<number, string[]>();
  const seen = new Set<string>();
  for (const leave of input.leaves) {
    for (const key of leaveWorkingDays(leave.start, leave.end)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const y = Number(key.slice(0, 4));
      const list = daysByYear.get(y);
      if (list) list.push(key);
      else daysByYear.set(y, [key]);
    }
  }

  const startYear = startDate ? Number(startDate.slice(0, 4)) : null;
  // Six years back is far beyond any carry's reach; it only bounds the walk.
  const firstYear = Math.max(
    startYear !== null ? Math.max(startYear, year - 6) : year - 1,
    // Not given means nothing recorded before this year, so nothing carries.
    Math.min(input.trackedFromYear ?? year, year),
  );

  let carryIn = 0;
  let carryDeadline: string | null = null;
  let carryFromAdmission = false;
  let result: LeaveBalance | null = null;

  for (let y = firstYear; y <= year; y++) {
    const own = entitlementFor(startDate, y);

    // The year after joining may not exceed 30 days with what carried over.
    if (carryFromAdmission) carryIn = Math.min(carryIn, Math.max(0, YEAR_AFTER_ADMISSION_CAP - own.days));

    const days = (daysByYear.get(y) ?? []).sort();
    const inWindow = carryDeadline ? days.filter((d) => d <= carryDeadline!).length : 0;
    const useCarry = Math.min(carryIn, inWindow);
    const usedOwn = days.length - useCarry;
    const carryUnused = carryIn - useCarry;

    if (y === year) {
      const expired = carryDeadline !== null && today > carryDeadline ? carryUnused : 0;
      result = {
        year,
        entitlement: own.days,
        carried: carryIn,
        carriedDeadline: carryIn > 0 ? carryDeadline : null,
        carriedExpired: expired,
        booked: days.length,
        taken: days.filter((d) => d < today).length,
        remaining: own.days - usedOwn + (carryUnused - expired),
        // Only worth saying while it is still ahead or this year.
        availableFrom: own.availableFrom,
        admissionYear: own.admissionYear,
        startDateMissing: !startDate,
      };
      break;
    }

    // What this year leaves for the next one.
    carryIn = Math.max(0, own.days - usedOwn);
    carryFromAdmission = own.admissionYear;
    // The joining year's days, if they only became usable after New Year,
    // run to 30 June; anything else to 30 April.
    carryDeadline =
      own.admissionYear && own.availableFrom && own.availableFrom > `${y}-12-31`
        ? `${y + 1}-06-30`
        : `${y + 1}-04-30`;
  }

  return result!;
}

/** Whether a date falls inside any of the ranges. */
export function onLeave(leaves: LeaveRange[], key: string): boolean {
  return leaves.some((l) => l.start <= key && key <= l.end);
}
