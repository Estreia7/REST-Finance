import { describe, it, expect } from 'vitest';
import {
  startOfWeek,
  weekDates,
  addDays,
  addWeeks,
  dateKey,
  parseDateKey,
  formatMinutes,
  parseTime,
  shiftLength,
  formatDuration,
  formatWeekRange,
  weeklyMinutes,
  employeeColor,
} from '@/lib/schedule';

describe('startOfWeek', () => {
  it('returns the Monday of the week', () => {
    // 2026-09-16 is a Wednesday.
    expect(dateKey(startOfWeek(new Date('2026-09-16T12:00:00Z')))).toBe('2026-09-14');
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    // The classic off-by-one: getUTCDay() is 0 on Sunday, so a naive
    // implementation jumps forward a week here.
    expect(dateKey(startOfWeek(new Date('2026-09-20T12:00:00Z')))).toBe('2026-09-14');
  });

  it('is idempotent on a Monday', () => {
    const monday = startOfWeek(new Date('2026-09-14T00:00:00Z'));
    expect(dateKey(startOfWeek(monday))).toBe('2026-09-14');
  });

  it('crosses a month boundary', () => {
    expect(dateKey(startOfWeek(new Date('2026-10-01T12:00:00Z')))).toBe('2026-09-28');
  });

  it('crosses a year boundary', () => {
    expect(dateKey(startOfWeek(new Date('2027-01-01T12:00:00Z')))).toBe('2026-12-28');
  });

  it('ignores the time of day', () => {
    const early = startOfWeek(new Date('2026-09-16T00:00:00Z'));
    const late = startOfWeek(new Date('2026-09-16T23:59:59Z'));
    expect(dateKey(early)).toBe(dateKey(late));
  });
});

describe('weekDates', () => {
  it('gives seven consecutive days, Monday to Sunday', () => {
    const days = weekDates(new Date('2026-09-16T12:00:00Z')).map(dateKey);
    expect(days).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16',
      '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
  });
});

describe('date arithmetic', () => {
  it('adds weeks across a month end', () => {
    expect(dateKey(addWeeks(parseDateKey('2026-09-28'), 1))).toBe('2026-10-05');
  });

  it('survives a DST change', () => {
    // Portugal turns the clocks back on 2026-10-25. A local-time
    // implementation lands on the 25th at 23:00 and loses a day here.
    expect(dateKey(addDays(parseDateKey('2026-10-25'), 1))).toBe('2026-10-26');
    expect(dateKey(addWeeks(parseDateKey('2026-10-19'), 1))).toBe('2026-10-26');
  });

  it('round-trips a date key', () => {
    expect(dateKey(parseDateKey('2026-02-29'))).toBe('2026-03-01'); // 2026 is not a leap year
    expect(dateKey(parseDateKey('2028-02-29'))).toBe('2028-02-29'); // 2028 is
  });
});

describe('times', () => {
  it('formats minutes from midnight', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(1439)).toBe('23:59');
  });

  it('parses valid times', () => {
    expect(parseTime('09:00')).toBe(540);
    expect(parseTime('9:00')).toBe(540);
    expect(parseTime(' 17:30 ')).toBe(1050);
  });

  it('rejects what is not a time', () => {
    for (const bad of ['', '25:00', '09:60', 'abc', '09', '09:0', '-1:00']) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});

describe('shiftLength', () => {
  it('measures an ordinary shift', () => {
    expect(shiftLength(540, 1020)).toBe(480); // 09:00–17:00 = 8h
  });

  it('measures a shift that runs past midnight', () => {
    // A close ending at 02:00 must not read as negative, or a weekly total
    // shrinks as someone works later.
    expect(shiftLength(1020, 120)).toBe(540); // 17:00–02:00 = 9h
  });

  it('treats an identical start and end as a full day, not zero', () => {
    expect(shiftLength(540, 540)).toBe(1440);
  });
});

describe('formatDuration', () => {
  it('says hours the way a restaurant does', () => {
    expect(formatDuration(480)).toBe('8h');
    expect(formatDuration(450)).toBe('7h30');
    expect(formatDuration(485)).toBe('8h05');
  });
});

describe('formatWeekRange', () => {
  it('names the month once when the week stays inside it', () => {
    expect(formatWeekRange(parseDateKey('2026-09-14'), 'pt')).toBe('14 – 20 de setembro 2026');
  });

  it('names both months when the week crosses', () => {
    expect(formatWeekRange(parseDateKey('2026-09-28'), 'pt')).toBe(
      '28 de setembro – 4 de outubro 2026'
    );
  });

  it('has an English form', () => {
    expect(formatWeekRange(parseDateKey('2026-09-14'), 'en')).toBe('14 – 20 September 2026');
  });
});

describe('weeklyMinutes', () => {
  it('totals each person separately', () => {
    const totals = weeklyMinutes([
      { employeeId: 'a', startMin: 540, endMin: 1020 },
      { employeeId: 'a', startMin: 540, endMin: 1020 },
      { employeeId: 'b', startMin: 1020, endMin: 120 },
    ]);
    expect(totals.get('a')).toBe(960);
    expect(totals.get('b')).toBe(540);
  });

  it('is empty for a week with no shifts', () => {
    expect(weeklyMinutes([]).size).toBe(0);
  });
});

describe('employeeColor', () => {
  it('falls back rather than returning undefined for an unknown key', () => {
    expect(employeeColor('not-a-colour').key).toBe('slate');
  });

  it('resolves a known key', () => {
    expect(employeeColor('amber').dot).toBe('#d97706');
  });
});
