import { describe, it, expect } from 'vitest';
import { monthProgress } from '@/lib/trading-days';

/** A month's worth of trading at a flat 100 EUR a day, days 1..n. */
function flat(year: number, month: number, upTo: number, amount = 100) {
  return Array.from({ length: upTo }, (_, i) => ({
    date: `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    revenue: amount,
  }));
}

describe('how far through the month the restaurant is', () => {
  it('counts the days traded and the days left', () => {
    // 15 October, traded every day so far. 31 days in the month.
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 15)),
      revenueByDate: flat(2026, 9, 15),
      closedDates: [],
    });
    expect(p.elapsed).toBe(15);
    expect(p.remaining).toBe(16);
    expect(p.revenueSoFar).toBe(1500);
    expect(p.dailyAverage).toBe(100);
    expect(p.projection).toBe(3100);
  });

  it('leaves declared closures out of both counts', () => {
    // Shuts Mondays: 5, 12, 19 and 26 October 2026 are Mondays.
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 15)),
      revenueByDate: flat(2026, 9, 15).filter((r) => !['2026-10-05', '2026-10-12'].includes(r.date)),
      closedDates: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'],
    });
    // 15 calendar days, two of them closed.
    expect(p.elapsed).toBe(13);
    // 16 calendar days left, two of them closed.
    expect(p.remaining).toBe(14);
    expect(p.revenueSoFar).toBe(1300);
    expect(p.dailyAverage).toBe(100);
    expect(p.projection).toBe(2700);
  });

  it('still counts a past day with no takings entered', () => {
    // This is the one that matters. If an unentered day left the
    // denominator, the average would read high and the estimate would
    // promise a month the restaurant is not having.
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 10)),
      // Only five of the ten days entered.
      revenueByDate: flat(2026, 9, 5),
      closedDates: [],
    });
    expect(p.elapsed).toBe(10);
    expect(p.dailyAverage).toBe(50);
    // Not 100/day. The five blank days drag the average down, which is the
    // honest reading of "we have taken 500 in ten days".
    expect(p.projection).toBe(1550);
  });

  it('counts a day that opened and took nothing', () => {
    // Recorded at zero is not the same as not recorded: the owner told us
    // the day happened. It belongs in the denominator either way, but the
    // revenue is real at zero.
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 3)),
      revenueByDate: [
        { date: '2026-10-01', revenue: 300 },
        { date: '2026-10-02', revenue: 0 },
        { date: '2026-10-03', revenue: 300 },
      ],
      closedDates: [],
    });
    expect(p.elapsed).toBe(3);
    expect(p.dailyAverage).toBe(200);
  });

  it('counts a day that traded even though it was marked closed', () => {
    // A holiday they opened anyway. The takings are proof it traded, and
    // excluding it would divide real revenue by a day that "did not happen".
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 2)),
      revenueByDate: [
        { date: '2026-10-01', revenue: 100 },
        { date: '2026-10-02', revenue: 100 },
      ],
      closedDates: ['2026-10-02'],
    });
    expect(p.elapsed).toBe(2);
    expect(p.dailyAverage).toBe(100);
  });

  it('gives no average or estimate before anything has sold', () => {
    // A zero average would project a zero month on the 1st, which is a
    // number the owner would believe.
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 1)),
      revenueByDate: [],
      closedDates: [],
    });
    expect(p.revenueSoFar).toBe(0);
    expect(p.dailyAverage).toBeNull();
    expect(p.projection).toBeNull();
  });

  it('has nothing left to project on the last day of the month', () => {
    const p = monthProgress({
      today: new Date(Date.UTC(2026, 9, 31)),
      revenueByDate: flat(2026, 9, 31),
      closedDates: [],
    });
    expect(p.remaining).toBe(0);
    // The estimate is just what happened.
    expect(p.projection).toBe(p.revenueSoFar);
  });

  it('gets February right in a leap year and out of one', () => {
    const leap = monthProgress({
      today: new Date(Date.UTC(2028, 1, 10)),
      revenueByDate: flat(2028, 1, 10),
      closedDates: [],
    });
    expect(leap.elapsed + leap.remaining).toBe(29);

    const plain = monthProgress({
      today: new Date(Date.UTC(2026, 1, 10)),
      revenueByDate: flat(2026, 1, 10),
      closedDates: [],
    });
    expect(plain.elapsed + plain.remaining).toBe(28);
  });
});
