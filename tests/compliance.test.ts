import { describe, it, expect } from 'vitest';
import { statusFor, daysUntilExpiry, EXPIRY_WARNING_DAYS } from '@/lib/compliance';

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

  it('warns inside the notice window', () => {
    expect(statusFor(inDays(1), NOW)).toBe('expiring');
    expect(statusFor(inDays(30), NOW)).toBe('expiring');
    expect(statusFor(inDays(EXPIRY_WARNING_DAYS), NOW)).toBe('expiring');
  });

  it('stays valid beyond the notice window', () => {
    expect(statusFor(inDays(EXPIRY_WARNING_DAYS + 1), NOW)).toBe('valid');
    expect(statusFor(inDays(365), NOW)).toBe('valid');
  });

  it('does not call today expired', () => {
    // An insurance valid through today is still valid today.
    expect(statusFor(NOW, NOW)).toBe('expiring');
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

  it('returns null when there is no expiry', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
});
