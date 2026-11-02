import { describe, it, expect } from 'vitest';
import { hashPin } from '@/lib/time-clock-server';
import { isValidPin, isStale, entryMinutes, lisbonParts, lisbonToUtc, monthSummary } from '@/lib/time-clock';

describe('time clock', () => {
  it('accepts only four digits as a PIN', () => {
    expect(isValidPin('0420')).toBe(true);
    expect(isValidPin('420')).toBe(false);
    expect(isValidPin('04a0')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
  });

  it('hashes a PIN per restaurant, so the same PIN elsewhere is a different person', () => {
    expect(hashPin('r1', '1234', 's')).toBe(hashPin('r1', '1234', 's'));
    expect(hashPin('r1', '1234', 's')).not.toBe(hashPin('r2', '1234', 's'));
    expect(hashPin('r1', '1234', 's')).not.toBe(hashPin('r1', '1234', 'other'));
  });

  it('reads Lisbon wall-clock time in winter and summer', () => {
    expect(lisbonParts(new Date('2026-01-15T09:30:00Z'))).toEqual({ dateKey: '2026-01-15', minutes: 570 });
    expect(lisbonParts(new Date('2026-07-15T09:30:00Z'))).toEqual({ dateKey: '2026-07-15', minutes: 630 });
    expect(lisbonParts(new Date('2026-07-15T23:30:00Z')).dateKey).toBe('2026-07-16');
  });

  it('turns a Lisbon time back into the instant', () => {
    expect(lisbonToUtc('2026-01-15', 570).toISOString()).toBe('2026-01-15T09:30:00.000Z');
    expect(lisbonToUtc('2026-07-15', 630).toISOString()).toBe('2026-07-15T09:30:00.000Z');
    expect(lisbonToUtc('2026-07-16', 30).toISOString()).toBe('2026-07-15T23:30:00.000Z');
  });

  it('counts an entry left open past 16 hours as a missing clock-out', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    expect(isStale(new Date('2026-10-30T02:00:00Z'), now)).toBe(false);
    expect(isStale(new Date('2026-10-29T19:00:00Z'), now)).toBe(true);
    expect(entryMinutes(new Date('2026-10-30T09:00:00Z'), new Date('2026-10-30T17:29:40Z'))).toBe(510);
    expect(entryMinutes(new Date('2026-10-30T09:00:00Z'), null)).toBeNull();
  });

  it('sets hours worked against the rota, without guessing open entries', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    const rows = monthSummary({
      employees: [{ id: 'ana' }, { id: 'rui' }],
      shifts: [
        { employeeId: 'ana', startMin: 600, endMin: 1380, breakStartMin: 900, breakEndMin: 1140 }, // 9h split
        { employeeId: 'ana', startMin: 600, endMin: 1080 }, // 8h
        { employeeId: 'rui', startMin: 1140, endMin: 120 }, // 7h past midnight
      ],
      entries: [
        { employeeId: 'ana', clockIn: new Date('2026-10-28T10:00:00Z'), clockOut: new Date('2026-10-28T18:30:00Z') },
        { employeeId: 'ana', clockIn: new Date('2026-10-29T10:00:00Z'), clockOut: new Date('2026-10-29T18:00:00Z') },
        { employeeId: 'ana', clockIn: new Date('2026-10-30T09:55:00Z'), clockOut: null },
        { employeeId: 'rui', clockIn: new Date('2026-10-28T19:00:00Z'), clockOut: null },
      ],
      now,
    });
    expect(rows[0]).toEqual({ employeeId: 'ana', scheduledMin: 1020, workedMin: 990, diffMin: -30, inSince: '2026-10-30T09:55:00.000Z', missingOut: 0 });
    expect(rows[1]).toEqual({ employeeId: 'rui', scheduledMin: 420, workedMin: 0, diffMin: -420, inSince: null, missingOut: 1 });
  });
});
