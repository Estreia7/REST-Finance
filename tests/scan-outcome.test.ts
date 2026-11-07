import { describe, it, expect } from 'vitest';
import { scanOutcome } from '@/lib/scan-outcome';

describe('scanOutcome', () => {
  it('has nothing to say before an invoice is taken', () => {
    expect(scanOutcome([])).toBeNull();
  });

  it('waits for every invoice of the sitting', () => {
    expect(scanOutcome(['saved', 'reading'])).toBe('reading');
    expect(scanOutcome(['waiting', 'saved'])).toBe('reading');
  });

  it('reports the last invoice taken', () => {
    expect(scanOutcome(['failed', 'saved'])).toBe('saved');
    expect(scanOutcome(['saved', 'already'])).toBe('already');
    expect(scanOutcome(['saved', 'failed'])).toBe('failed');
  });

  it('calls anything waiting for a person queued', () => {
    for (const status of ['review', 'retake', 'copy']) expect(scanOutcome([status])).toBe('queued');
  });
});
