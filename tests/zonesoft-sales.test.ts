import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the transcribed ZoneSoft report.
 *
 * These figures become a client's 2025 revenue, so the file has to be checked
 * against something other than a careful read. The report prints its own
 * totals, which is exactly the independent check needed: if a digit was
 * mistyped or a row dropped, the sum stops matching.
 */

const CSV = path.join(process.cwd(), 'scripts', 'data', 'vendas-2025.csv');

/** The totals the report prints on its last page. */
const REPORTED = {
  revenue: 60085.55,
  tickets: 2359,
  days: 255,
  meanRevenue: 235.63,
  meanTickets: 9.251,
};

interface Row {
  day: number;
  month: number;
  year: number;
  revenue: number;
  tickets: number;
  raw: string;
}

function readRows(): Row[] {
  const lines = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/);
  expect(lines[0]).toBe('data,bruto,docs');

  return lines.slice(1).map((raw) => {
    const [dmy, bruto, docs] = raw.split(',');
    const [day, month, year] = dmy.split('-').map(Number);
    return { day, month, year, revenue: Number(bruto), tickets: Number(docs), raw };
  });
}

describe('the transcribed ZoneSoft report', () => {
  const rows = readRows();

  it('has every trading day the report counted', () => {
    expect(rows).toHaveLength(REPORTED.days);
  });

  it('sums to the total the report printed', () => {
    // To the cent. Anything else means a digit was mistyped somewhere in 255
    // rows, and this is the only way to find out without re-reading them all.
    const sum = rows.reduce((s, r) => s + r.revenue, 0);
    expect(sum).toBeCloseTo(REPORTED.revenue, 2);
  });

  it('sums to the document count the report printed', () => {
    const sum = rows.reduce((s, r) => s + r.tickets, 0);
    expect(sum).toBe(REPORTED.tickets);
  });

  it('reproduces the report’s own averages', () => {
    // A second, independent check: a compensating pair of errors could leave
    // the total right, but not the total and both means together.
    const revenue = rows.reduce((s, r) => s + r.revenue, 0) / rows.length;
    const tickets = rows.reduce((s, r) => s + r.tickets, 0) / rows.length;
    expect(revenue).toBeCloseTo(REPORTED.meanRevenue, 2);
    expect(tickets).toBeCloseTo(REPORTED.meanTickets, 2);
  });

  it('is entirely within 2025', () => {
    for (const r of rows) expect(r.year, r.raw).toBe(2025);
  });

  it('is in date order, with no day appearing twice', () => {
    // A duplicate date would be silently swallowed by the unique key on
    // import, losing a day's takings without an error.
    const keys = rows.map((r) => `${r.year}-${r.month}-${r.day}`);
    expect(new Set(keys).size).toBe(rows.length);

    const sortable = rows.map((r) => r.year * 10000 + r.month * 100 + r.day);
    expect([...sortable].sort((a, b) => a - b)).toEqual(sortable);
  });

  it('has no day with takings but no bills, or bills but no takings', () => {
    // Either one alone is a transcription slip: a day in this report always
    // has both.
    for (const r of rows) {
      expect(r.revenue, r.raw).toBeGreaterThan(0);
      expect(r.tickets, r.raw).toBeGreaterThan(0);
    }
  });

  it('holds dates that are real calendar days', () => {
    for (const r of rows) {
      const d = new Date(Date.UTC(r.year, r.month - 1, r.day));
      expect(d.getUTCDate(), r.raw).toBe(r.day);
      expect(d.getUTCMonth(), r.raw).toBe(r.month - 1);
    }
  });

  it('trades Tuesday to Saturday, closing most Mondays and Sundays', () => {
    // Not a rule about the calendar — a check that the dates land where a
    // restaurant's week actually falls. A transcription slip that moved days
    // into the wrong date would flatten this distribution.
    //
    // The real pattern in 2025: Tue/Wed/Fri ~51 days each, Thu 49, Sat 40,
    // and then 12 Mondays and a single Sunday. Those few are the holidays
    // and the one weekend they opened — verified against the report rather
    // than assumed away.
    const byWeekday = new Map<number, number>();
    for (const r of rows) {
      const wd = new Date(Date.UTC(r.year, r.month - 1, r.day)).getUTCDay();
      byWeekday.set(wd, (byWeekday.get(wd) ?? 0) + 1);
    }

    // Tuesday through Saturday carry the year.
    for (const wd of [2, 3, 4, 5, 6]) {
      expect(byWeekday.get(wd) ?? 0, `weekday ${wd}`).toBeGreaterThan(30);
    }
    // Sunday and Monday are the exception, not the rule.
    expect((byWeekday.get(0) ?? 0) + (byWeekday.get(1) ?? 0)).toBeLessThan(20);
  });

  it('keeps every amount plausible for a day of restaurant trade', () => {
    // Wide on purpose: this is catching a misplaced decimal point or a
    // duplicated digit, not judging the business.
    for (const r of rows) {
      expect(r.revenue, r.raw).toBeLessThan(5000);
      expect(r.tickets, r.raw).toBeLessThan(200);
    }
  });
});
