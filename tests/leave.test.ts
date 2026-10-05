import { describe, it, expect } from 'vitest';
import {
  easterSunday, portugueseHolidays, holidayOn, isLeaveWorkingDay, leaveWorkingDays,
  addMonths, completeMonths, entitlementFor, leaveBalance, onLeave,
} from '@/lib/leave';
import { dateKey, parseDateKey } from '@/lib/schedule';

describe('easterSunday', () => {
  it('matches the published dates', () => {
    expect(dateKey(easterSunday(2024))).toBe('2024-03-31');
    expect(dateKey(easterSunday(2025))).toBe('2025-04-20');
    expect(dateKey(easterSunday(2026))).toBe('2026-04-05');
    expect(dateKey(easterSunday(2027))).toBe('2027-03-28');
  });
});

describe('portugueseHolidays', () => {
  it('lists the thirteen national holidays, the moving ones included', () => {
    const days = portugueseHolidays(2026);
    expect(days).toHaveLength(13);
    expect(holidayOn('2026-04-03')).toBe('goodFriday');
    expect(holidayOn('2026-06-04')).toBe('corpusChristi');
    expect(holidayOn('2026-12-08')).toBe('immaculate');
    expect(holidayOn('2026-06-05')).toBeNull();
  });
});

describe('leave working days', () => {
  it('does not count the weekend', () => {
    // Monday 10 to Sunday 16 August 2026.
    expect(leaveWorkingDays('2026-08-10', '2026-08-16')).toHaveLength(5);
  });

  it('does not count a public holiday inside the booking', () => {
    // 8–12 June 2026; the 10th is Dia de Portugal.
    expect(leaveWorkingDays('2026-06-08', '2026-06-12')).toHaveLength(4);
    expect(isLeaveWorkingDay('2026-06-10')).toBe(false);
  });

  it('counts a single weekday', () => {
    expect(leaveWorkingDays('2026-10-06', '2026-10-06')).toEqual(['2026-10-06']);
  });
});

describe('months', () => {
  it('clamps the day at the end of a short month', () => {
    expect(dateKey(addMonths(parseDateKey('2026-01-31'), 1))).toBe('2026-02-28');
  });

  it('counts only complete months', () => {
    expect(completeMonths('2026-03-01', '2026-12-31')).toBe(10);
    // Starting mid-month, December is not complete.
    expect(completeMonths('2026-03-15', '2026-12-31')).toBe(9);
    expect(completeMonths('2026-12-15', '2026-12-31')).toBe(0);
  });
});

describe('entitlementFor', () => {
  it('gives 22 days from the year after joining', () => {
    expect(entitlementFor('2025-07-01', 2026).days).toBe(22);
  });

  it('gives 2 days per complete month in the joining year, usable after six months', () => {
    const e = entitlementFor('2026-03-15', 2026);
    expect(e.days).toBe(18);
    expect(e.admissionYear).toBe(true);
    expect(e.availableFrom).toBe('2026-09-15');
  });

  it('caps the joining year at 20', () => {
    expect(entitlementFor('2026-01-01', 2026).days).toBe(20);
  });

  it('assumes a full year when the start date is unknown', () => {
    expect(entitlementFor(null, 2026).days).toBe(22);
  });

  it('gives nothing before joining', () => {
    expect(entitlementFor('2027-01-01', 2026).days).toBe(0);
  });
});

describe('leaveBalance', () => {
  it('counts booked and taken against the year', () => {
    const b = leaveBalance({
      startDate: '2020-01-01',
      leaves: [
        { start: '2026-08-10', end: '2026-08-14' }, // 5, past
        { start: '2026-12-21', end: '2026-12-24' }, // 4, future
      ],
      year: 2026,
      today: '2026-10-05',
      trackedFromYear: 2026,
    });
    expect(b.entitlement).toBe(22);
    expect(b.booked).toBe(9);
    expect(b.taken).toBe(5);
    expect(b.remaining).toBe(13);
    expect(b.carried).toBe(0);
  });

  it('carries unused days to the next year, spent first until 30 April', () => {
    const leaves = [
      { start: '2025-08-04', end: '2025-08-15' }, // 10 days in 2025 (15 Aug is a holiday: 9)
      { start: '2026-03-02', end: '2026-03-06' }, // 5 days in the carry window
    ];
    const b = leaveBalance({ startDate: '2020-01-01', leaves, year: 2026, today: '2026-03-10', trackedFromYear: 2025 });
    // 2025: 22 − 9 = 13 carried.
    expect(b.carried).toBe(13);
    expect(b.carriedDeadline).toBe('2026-04-30');
    // March's 5 come out of the carried 13, leaving 8 + 22.
    expect(b.remaining).toBe(30);
    expect(b.carriedExpired).toBe(0);
  });

  it('lets carried days lapse after 30 April', () => {
    const leaves = [{ start: '2025-08-04', end: '2025-08-15' }];
    const b = leaveBalance({ startDate: '2020-01-01', leaves, year: 2026, today: '2026-05-04', trackedFromYear: 2025 });
    expect(b.carried).toBe(13);
    expect(b.carriedExpired).toBe(13);
    expect(b.remaining).toBe(22);
  });

  it('carries nothing from a year before the restaurant recorded holidays', () => {
    const b = leaveBalance({ startDate: '2020-01-01', leaves: [], year: 2026, today: '2026-02-01', trackedFromYear: 2026 });
    expect(b.carried).toBe(0);
    expect(b.remaining).toBe(22);
  });

  it('runs the joining year days to 30 June when the six months end after New Year', () => {
    // Joined 1 September 2025: 4 months, 8 days, usable from 1 March 2026.
    const b = leaveBalance({ startDate: '2025-09-01', leaves: [], year: 2026, today: '2026-02-01', trackedFromYear: 2025 });
    expect(b.carried).toBe(8);
    expect(b.carriedDeadline).toBe('2026-06-30');
    expect(b.remaining).toBe(30);
  });

  it('caps the year after joining at 30 days', () => {
    // Joined 1 March 2025: 10 months, 20 days, usable from 1 September 2025.
    // None taken, so 20 carry — but 22 + 20 is over 30, so only 8 do.
    const b = leaveBalance({ startDate: '2025-03-01', leaves: [], year: 2026, today: '2026-02-01', trackedFromYear: 2025 });
    expect(b.carried).toBe(8);
    expect(b.remaining).toBe(30);
  });

  it('counts a booking across New Year in the year each day falls in', () => {
    const leaves = [{ start: '2026-12-28', end: '2027-01-08' }];
    const y2026 = leaveBalance({ startDate: '2020-01-01', leaves, year: 2026, today: '2026-10-01', trackedFromYear: 2026 });
    const y2027 = leaveBalance({ startDate: '2020-01-01', leaves, year: 2027, today: '2026-10-01', trackedFromYear: 2026 });
    // 28–31 Dec: 4 weekdays. 1 Jan is a holiday; 4–8 Jan: 5.
    expect(y2026.booked).toBe(4);
    expect(y2027.booked).toBe(5);
  });

  it('goes negative when more is booked than is due', () => {
    const b = leaveBalance({
      startDate: '2020-01-01',
      leaves: [{ start: '2026-07-01', end: '2026-08-31' }],
      year: 2026, today: '2026-01-01', trackedFromYear: 2026,
    });
    expect(b.remaining).toBeLessThan(0);
  });

  it('shows nothing due before someone joins', () => {
    const b = leaveBalance({ startDate: '2027-02-01', leaves: [], year: 2026, today: '2026-10-05' });
    expect(b.entitlement).toBe(0);
    expect(b.remaining).toBe(0);
  });

  it('flags a missing start date', () => {
    const b = leaveBalance({ startDate: null, leaves: [], year: 2026, today: '2026-10-05' });
    expect(b.startDateMissing).toBe(true);
    expect(b.remaining).toBe(22);
  });
});

describe('onLeave', () => {
  it('includes both ends of a range', () => {
    const leaves = [{ start: '2026-08-10', end: '2026-08-14' }];
    expect(onLeave(leaves, '2026-08-10')).toBe(true);
    expect(onLeave(leaves, '2026-08-14')).toBe(true);
    expect(onLeave(leaves, '2026-08-15')).toBe(false);
  });
});
