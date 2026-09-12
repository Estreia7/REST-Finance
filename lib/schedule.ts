/**
 * The arithmetic behind the weekly rota.
 *
 * Everything here is pure: given a date or a number of minutes, it returns a
 * date or a string. That is deliberate — the parts of scheduling that go
 * wrong are off-by-one weekdays, minutes that wrap past midnight, and copying
 * a week onto itself, and none of those need a database to test.
 *
 * Times are minutes from midnight, never timestamps. A grid that repeats every
 * week has no business carrying timezones or daylight saving: when the clocks
 * change, a shift that reads "09:00–17:00" is still 09:00–17:00 to the person
 * working it, and an instant-based model would silently shift it by an hour.
 */

/** Monday first: Portugal reads a week starting Monday, not Sunday. */
export const WEEKDAYS_PT = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_PT_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const WEEKDAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS_EN_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Midnight UTC on the Monday of the week containing `date`.
 *
 * UTC throughout: the grid is a calendar, and building it from local time
 * means a user in a different offset sees the week shift under them. The
 * database column is a DATE for the same reason.
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay is 0 for Sunday, so Sunday is 6 days after its Monday, not 1
  // day before the next one. This is the classic off-by-one in week grids.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

/** The seven dates of the week containing `date`, Monday first. */
export function weekDates(date: Date): Date[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/** `2026-09-14`, the key the grid uses to find a day's shifts. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses `2026-09-14` back into midnight UTC on that day. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 540 -> "09:00". */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "09:00" -> 540. Returns null for anything that is not a real time. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * How long a shift runs, in minutes.
 *
 * A close that ends at 02:00 has an end earlier than its start. Treating that
 * as negative would make the weekly total shrink as someone works later, so
 * an end at or before the start is read as running into the next day.
 */
export function shiftLength(startMin: number, endMin: number): number {
  return endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
}

/** "7h30" — hours as a restaurant says them, not 7.5. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** `09:00–17:00`, with an en dash because it is a range, not a hyphen. */
export function formatRange(startMin: number, endMin: number): string {
  return `${formatMinutes(startMin)}–${formatMinutes(endMin)}`;
}

/**
 * "1 – 7 de setembro" / "29 de setembro – 5 de outubro".
 *
 * The month is named once when the week does not cross into another, which is
 * five weeks in six and the difference between a title that reads and one
 * that repeats itself.
 */
export function formatWeekRange(monday: Date, language: 'pt' | 'en' = 'pt'): string {
  const sunday = addDays(monday, 6);
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  const day = (d: Date) => d.getUTCDate();
  const monthName = (d: Date) =>
    d.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
  const year = sunday.getUTCFullYear();

  if (sameMonth) {
    return language === 'pt'
      ? `${day(monday)} – ${day(sunday)} de ${monthName(sunday)} ${year}`
      : `${day(monday)} – ${day(sunday)} ${monthName(sunday)} ${year}`;
  }

  return language === 'pt'
    ? `${day(monday)} de ${monthName(monday)} – ${day(sunday)} de ${monthName(sunday)} ${year}`
    : `${day(monday)} ${monthName(monday)} – ${day(sunday)} ${monthName(sunday)} ${year}`;
}

/** The shifts of one week, totalled per person. */
export function weeklyMinutes(
  shifts: Array<{ employeeId: string; startMin: number; endMin: number }>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of shifts) {
    totals.set(s.employeeId, (totals.get(s.employeeId) ?? 0) + shiftLength(s.startMin, s.endMin));
  }
  return totals;
}

/**
 * The colours a person can be tagged with on the grid.
 *
 * Named rather than free hex, so every restaurant's schedule stays legible
 * and the image export can rely on known values. Each carries a dot for the
 * grid and a printable pair for the exported picture.
 */
export const EMPLOYEE_COLORS = [
  { key: 'slate', label: 'Cinza', dot: '#64748b', bg: '#f1f5f9', ink: '#334155' },
  { key: 'amber', label: 'Âmbar', dot: '#d97706', bg: '#fef3c7', ink: '#92400e' },
  { key: 'emerald', label: 'Verde', dot: '#059669', bg: '#d1fae5', ink: '#065f46' },
  { key: 'sky', label: 'Azul', dot: '#0284c7', bg: '#e0f2fe', ink: '#075985' },
  { key: 'violet', label: 'Roxo', dot: '#7c3aed', bg: '#ede9fe', ink: '#5b21b6' },
  { key: 'rose', label: 'Rosa', dot: '#e11d48', bg: '#ffe4e6', ink: '#9f1239' },
  { key: 'teal', label: 'Turquesa', dot: '#0d9488', bg: '#ccfbf1', ink: '#115e59' },
  { key: 'orange', label: 'Laranja', dot: '#ea580c', bg: '#ffedd5', ink: '#9a3412' },
] as const;

export type EmployeeColorKey = (typeof EMPLOYEE_COLORS)[number]['key'];

export function employeeColor(key: string) {
  return EMPLOYEE_COLORS.find((c) => c.key === key) ?? EMPLOYEE_COLORS[0];
}
