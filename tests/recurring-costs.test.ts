import { describe, it, expect } from 'vitest';
import { occurrenceIn, endDateFor, dueOccurrences, nextOccurrence } from '@/lib/recurring-costs';

describe('occurrenceIn', () => {
  it('uses the chosen day', () => {
    expect(occurrenceIn(2026, 9, 5)).toBe('2026-10-05');
  });

  it('moves the 31st to the last day of a short month', () => {
    expect(occurrenceIn(2027, 1, 31)).toBe('2027-02-28');
    expect(occurrenceIn(2028, 1, 31)).toBe('2028-02-29');
    expect(occurrenceIn(2026, 10, 31)).toBe('2026-11-30');
  });
});

describe('endDateFor', () => {
  it('counts the first month in a 12-month contract', () => {
    expect(endDateFor('2026-10-05', 5, 12)).toBe('2027-09-05');
  });

  it('ends in the same month for a one-month repeat', () => {
    expect(endDateFor('2026-10-05', 5, 1)).toBe('2026-10-05');
  });
});

describe('dueOccurrences', () => {
  const base = { startDate: '2026-10-05', dayOfMonth: 5, endDate: null };

  it('books nothing more until the next month comes round', () => {
    expect(dueOccurrences({ ...base, lastGeneratedDate: '2026-10-05', today: '2026-11-04' })).toEqual([]);
  });

  it('books the month once its day arrives', () => {
    expect(dueOccurrences({ ...base, lastGeneratedDate: '2026-10-05', today: '2026-11-05' })).toEqual(['2026-11-05']);
  });

  it('catches up every month nobody opened the app', () => {
    expect(dueOccurrences({ ...base, lastGeneratedDate: '2026-10-05', today: '2027-01-20' })).toEqual([
      '2026-11-05', '2026-12-05', '2027-01-05',
    ]);
  });

  it('includes the first date when nothing has been booked yet', () => {
    expect(dueOccurrences({ ...base, lastGeneratedDate: null, today: '2026-11-10' })).toEqual([
      '2026-10-05', '2026-11-05',
    ]);
  });

  it('stops at the end of the contract', () => {
    const due = dueOccurrences({
      ...base, endDate: '2026-12-05', lastGeneratedDate: '2026-10-05', today: '2027-06-01',
    });
    expect(due).toEqual(['2026-11-05', '2026-12-05']);
  });

  it('keeps the chosen day after a short month', () => {
    const due = dueOccurrences({
      startDate: '2027-01-31', dayOfMonth: 31, endDate: null, lastGeneratedDate: '2027-01-31', today: '2027-03-31',
    });
    expect(due).toEqual(['2027-02-28', '2027-03-31']);
  });

  it('books nothing for a contract that starts in the future', () => {
    expect(dueOccurrences({ ...base, startDate: '2026-12-05', lastGeneratedDate: null, today: '2026-10-06' })).toEqual([]);
  });
});

describe('nextOccurrence', () => {
  it('is the following month', () => {
    expect(nextOccurrence({ startDate: '2026-10-05', dayOfMonth: 5, endDate: null, lastGeneratedDate: '2026-12-05' }))
      .toBe('2027-01-05');
  });

  it('is null once the contract has run out', () => {
    expect(nextOccurrence({ startDate: '2026-10-05', dayOfMonth: 5, endDate: '2026-12-05', lastGeneratedDate: '2026-12-05' }))
      .toBeNull();
  });
});
