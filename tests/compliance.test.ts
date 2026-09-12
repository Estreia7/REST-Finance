import { describe, it, expect } from 'vitest';
import {
  statusFor,
  daysUntilExpiry,
  nextExpiryFrom,
  EXPIRY_WARNING_DAYS,
} from '@/lib/compliance';

const NOW = new Date('2026-09-12T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('statusFor', () => {
  it('treats a document with no expiry as permanent', () => {
    // A HACCP plan has no renewal date; chasing it would be noise.
    expect(statusFor(null, NOW)).toBe('no_expiry');
  });

  it('flags a document that has already lapsed', () => {
    expect(statusFor(inDays(-1), NOW)).toBe('expired');
    expect(statusFor(inDays(-400), NOW)).toBe('expired');
  });

  it('warns inside the fifteen-day notice window', () => {
    expect(statusFor(inDays(1), NOW)).toBe('expiring');
    expect(statusFor(inDays(14), NOW)).toBe('expiring');
    expect(statusFor(inDays(EXPIRY_WARNING_DAYS), NOW)).toBe('expiring');
  });

  it('stays valid beyond the notice window', () => {
    expect(statusFor(inDays(EXPIRY_WARNING_DAYS + 1), NOW)).toBe('valid');
    // Thirty days out used to warn under the old sixty-day rule.
    expect(statusFor(inDays(30), NOW)).toBe('valid');
    expect(statusFor(inDays(365), NOW)).toBe('valid');
  });

  it('does not call today expired', () => {
    // An insurance valid through today is still valid today.
    expect(statusFor(NOW, NOW)).toBe('expiring');
  });

  it('keeps a licence valid for the whole of its last day', () => {
    // Expiring at midnight tonight, checked at midday: still in force.
    const endOfToday = new Date('2026-09-12T00:00:00Z');
    expect(statusFor(endOfToday, NOW)).toBe('expiring');
  });

  it('accepts a date string, since Prisma dates arrive serialised', () => {
    expect(statusFor(inDays(10).toISOString() as unknown as Date, NOW)).toBe('expiring');
  });
});

describe('daysUntilExpiry', () => {
  it('counts forward and backward', () => {
    expect(daysUntilExpiry(inDays(45), NOW)).toBe(45);
    expect(daysUntilExpiry(inDays(-10), NOW)).toBe(-10);
  });

  it('counts whole days, not elapsed hours', () => {
    // Tomorrow at 1am is one day away, not zero.
    const tomorrowEarly = new Date('2026-09-13T01:00:00Z');
    expect(daysUntilExpiry(tomorrowEarly, NOW)).toBe(1);
  });

  it('returns null when there is no expiry', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
});

describe('nextExpiryFrom', () => {
  it('adds a month for a monthly renewal', () => {
    expect(nextExpiryFrom(new Date('2026-01-15T00:00:00Z'), 'MONTHLY')).toEqual(
      new Date('2026-02-15T00:00:00Z')
    );
  });

  it('adds a year for an annual renewal', () => {
    expect(nextExpiryFrom(new Date('2026-03-01T00:00:00Z'), 'ANNUAL')).toEqual(
      new Date('2027-03-01T00:00:00Z')
    );
  });

  it('gives nothing back for a document that does not renew', () => {
    expect(nextExpiryFrom(NOW, 'NONE')).toBeNull();
  });

  it('does not mutate the date it was given', () => {
    const issued = new Date('2026-05-10T00:00:00Z');
    nextExpiryFrom(issued, 'ANNUAL');
    expect(issued).toEqual(new Date('2026-05-10T00:00:00Z'));
  });
});
