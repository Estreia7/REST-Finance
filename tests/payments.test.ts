import { describe, it, expect } from 'vitest';
import {
  addDays, daysBetween, dueDateFor, paymentState, paidOn, bucketOf,
  summarisePayables, parseTermsDays, isDayKey, DEFAULT_TERMS_DAYS, paymentColumns,
} from '@/lib/payments';

describe('dueDateFor', () => {
  it('adds the supplier terms to the invoice date', () => {
    expect(dueDateFor({ dateKey: '2026-10-01', hasVendor: true, termsDays: 15 })).toBe('2026-10-16');
  });

  it('gives 30 days to a supplier with no terms set', () => {
    expect(DEFAULT_TERMS_DAYS).toBe(30);
    expect(dueDateFor({ dateKey: '2026-10-01', hasVendor: true, termsDays: null })).toBe('2026-10-31');
  });

  it('honours terms of zero, which is cash on delivery', () => {
    expect(dueDateFor({ dateKey: '2026-10-01', hasVendor: true, termsDays: 0 })).toBe('2026-10-01');
  });

  it('makes a cost with no supplier due on its own date', () => {
    expect(dueDateFor({ dateKey: '2026-10-05', hasVendor: false, termsDays: null })).toBe('2026-10-05');
  });

  it('lets the owner own date win over the terms', () => {
    expect(dueDateFor({ dateKey: '2026-10-01', dueKey: '2026-12-01', hasVendor: true, termsDays: 15 })).toBe('2026-12-01');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19');
    expect(addDays('2028-02-15', 15)).toBe('2028-03-01');
  });
});

describe('paymentState', () => {
  const today = '2026-10-10';

  it('is paid once a payment date is recorded', () => {
    expect(paymentState({ paidKey: '2026-10-02', method: 'CASH', dueKey: '2026-09-01' }, today)).toBe('paid');
  });

  it('is due up to and including the due date', () => {
    expect(paymentState({ dueKey: '2026-10-10' }, today)).toBe('due');
    expect(paymentState({ dueKey: '2026-10-30' }, today)).toBe('due');
  });

  it('is overdue from the day after', () => {
    expect(paymentState({ dueKey: '2026-10-09' }, today)).toBe('overdue');
  });

  it('never makes a direct debit overdue: scheduled until the day, then paid', () => {
    expect(paymentState({ method: 'DIRECT_DEBIT', dueKey: '2026-10-11' }, today)).toBe('scheduled');
    expect(paymentState({ method: 'DIRECT_DEBIT', dueKey: '2026-10-10' }, today)).toBe('paid');
    expect(paymentState({ method: 'DIRECT_DEBIT', dueKey: '2026-08-01' }, today)).toBe('paid');
  });

  it('dates a direct debit as paid on its due day', () => {
    expect(paidOn({ method: 'DIRECT_DEBIT', dueKey: '2026-10-05' }, today)).toBe('2026-10-05');
    expect(paidOn({ method: 'DIRECT_DEBIT', dueKey: '2026-10-15' }, today)).toBeNull();
    expect(paidOn({ paidKey: '2026-10-01', dueKey: '2026-10-15' }, today)).toBe('2026-10-01');
  });
});

describe('bucketOf', () => {
  it('groups by days until due', () => {
    expect(bucketOf(-1)).toBe('overdue');
    expect(bucketOf(0)).toBe('week');
    expect(bucketOf(7)).toBe('week');
    expect(bucketOf(8)).toBe('fortnight');
    expect(bucketOf(15)).toBe('fortnight');
    expect(bucketOf(16)).toBe('month');
    expect(bucketOf(30)).toBe('month');
    expect(bucketOf(31)).toBe('later');
  });
});

describe('summarisePayables', () => {
  const today = '2026-10-10';

  it('counts what is late, what is coming, and leaves paid alone', () => {
    const s = summarisePayables(
      [
        { amount: 100, state: 'overdue', dueKey: '2026-10-01' },
        { amount: 50.1, state: 'overdue', dueKey: '2026-09-01' },
        { amount: 20, state: 'due', dueKey: '2026-10-12' },
        { amount: 30, state: 'due', dueKey: '2026-10-22' },
        { amount: 40, state: 'scheduled', dueKey: '2026-11-05' },
        { amount: 999, state: 'paid', dueKey: '2026-10-01' },
      ],
      today,
    );
    expect(s.overdue).toEqual({ count: 2, total: 150.1 });
    expect(s.open).toEqual({ count: 5, total: 240.1 });
    expect(s.scheduled).toEqual({ count: 1, total: 40 });
    expect(s.buckets.overdue.total).toBe(150.1);
    expect(s.buckets.week.total).toBe(20);
    expect(s.buckets.fortnight.total).toBe(30);
    expect(s.buckets.month.total).toBe(40);
    expect(s.buckets.later.count).toBe(0);
  });

  it('adds to the cent', () => {
    const s = summarisePayables(
      [0.1, 0.2, 0.3].map((amount) => ({ amount, state: 'due' as const, dueKey: today })),
      today,
    );
    expect(s.open.total).toBe(0.6);
  });
});

describe('parsing', () => {
  it('accepts whole days within a year, and empty as the default', () => {
    expect(parseTermsDays('45')).toBe(45);
    expect(parseTermsDays(0)).toBe(0);
    expect(parseTermsDays('')).toBeNull();
    expect(parseTermsDays(null)).toBeNull();
    expect(parseTermsDays(-1)).toBe('invalid');
    expect(parseTermsDays(400)).toBe('invalid');
    expect(parseTermsDays('7.5')).toBe('invalid');
  });

  it('checks calendar days', () => {
    expect(isDayKey('2026-10-10')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('10/10/2026')).toBe(false);
    expect(daysBetween('2026-10-10', '2026-10-07')).toBe(-3);
  });
});

describe('paymentColumns', () => {
  const today = '2026-10-10';

  it('leaves an unanswered cost unpaid', () => {
    expect(paymentColumns(undefined, '2026-10-01', today)).toEqual({ paymentMethod: null, paidKey: null, dueKey: null });
  });

  it('pays a cash invoice on its own date', () => {
    expect(paymentColumns({ paid: true, method: 'CASH' }, '2026-10-01', today))
      .toEqual({ paymentMethod: 'CASH', paidKey: '2026-10-01', dueKey: null });
  });

  it('does not date a payment in the future', () => {
    expect(paymentColumns({ paid: true, method: 'MULTIBANCO' }, '2026-10-20', today))
      .toMatchObject({ paidKey: today });
  });

  it('keeps a direct debit unpaid until it leaves', () => {
    expect(paymentColumns({ paid: true, method: 'DIRECT_DEBIT', dueDate: '2026-10-15' }, '2026-10-01', today))
      .toEqual({ paymentMethod: 'DIRECT_DEBIT', paidKey: null, dueKey: '2026-10-15' });
  });

  it('asks how a paid cost was paid', () => {
    expect(paymentColumns({ paid: true }, '2026-10-01', today)).toEqual({ error: 'payments.methodRequired' });
  });

  it('refuses a broken due date or an unknown method', () => {
    expect(paymentColumns({ paid: false, dueDate: '2026-13-01' }, '2026-10-01', today)).toEqual({ error: 'payments.invalidDueDate' });
    expect(paymentColumns({ paid: true, method: 'BITCOIN' as never }, '2026-10-01', today)).toEqual({ error: 'payments.invalidMethod' });
  });

  it('drops the method on a cost still to pay', () => {
    expect(paymentColumns({ paid: false, method: 'CASH' }, '2026-10-01', today))
      .toEqual({ paymentMethod: null, paidKey: null, dueKey: null });
  });
});
