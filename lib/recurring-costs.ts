/**
 * The calendar behind fixed monthly costs — rent, internet, a 12-month
 * contract — that the owner types once and the app books every month.
 *
 * Pure: dates in, date keys out. What goes wrong with a monthly repeat is the
 * 31st in February, a year boundary, and booking a month twice; none of that
 * needs a database to test.
 *
 * Dates are `YYYY-MM-DD` keys at midnight UTC, the way cost entries are
 * stored, so a generated entry lands on exactly the day the owner chose.
 */

/** The day a monthly cost falls on in a given month: the 31st becomes the 30th, or the 28th. */
export function occurrenceIn(year: number, month: number, dayOfMonth: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dayOfMonth), last);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parts(key: string): { year: number; month: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

/**
 * The last date a contract of `months` months books, counting the first.
 * Twelve months from October 2026 ends in September 2027.
 */
export function endDateFor(startDate: string, dayOfMonth: number, months: number): string {
  const { year, month } = parts(startDate);
  const last = month + Math.max(1, Math.floor(months)) - 1;
  return occurrenceIn(year + Math.floor(last / 12), last % 12, dayOfMonth);
}

/**
 * The dates still to book, oldest first.
 *
 * Starts the month after the last one booked (or at the first date, if none
 * has been) and stops at today and at the end of the contract, whichever
 * comes first. Catching up several months at once is deliberate: if nobody
 * opened the app in August, September still has August's internet bill.
 */
export function dueOccurrences(input: {
  startDate: string;
  dayOfMonth: number;
  endDate: string | null;
  lastGeneratedDate: string | null;
  today: string;
}): string[] {
  const { startDate, dayOfMonth, endDate, lastGeneratedDate, today } = input;
  const limit = endDate && endDate < today ? endDate : today;
  const out: string[] = [];

  if (!lastGeneratedDate) {
    if (startDate > limit) return out;
    out.push(startDate);
  }

  const from = parts(lastGeneratedDate ?? startDate);
  // Bounded walk: a century of months is far beyond any contract, and the
  // bound means a corrupt date can never spin forever.
  for (let i = 1; i <= 1200; i++) {
    const m = from.month + i;
    const date = occurrenceIn(from.year + Math.floor(m / 12), m % 12, dayOfMonth);
    if (date > limit) break;
    out.push(date);
  }
  return out;
}

/** The next date a cost will be booked, or null when the contract is over. */
export function nextOccurrence(input: {
  startDate: string;
  dayOfMonth: number;
  endDate: string | null;
  lastGeneratedDate: string | null;
}): string | null {
  const { startDate, dayOfMonth, endDate, lastGeneratedDate } = input;
  let next: string;
  if (!lastGeneratedDate) {
    next = startDate;
  } else {
    const { year, month } = parts(lastGeneratedDate);
    next = occurrenceIn(year + Math.floor((month + 1) / 12), (month + 1) % 12, dayOfMonth);
  }
  return endDate && next > endDate ? null : next;
}
