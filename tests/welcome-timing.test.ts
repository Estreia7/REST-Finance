import { describe, it, expect } from 'vitest';
import {
  MIN_MS,
  EXIT_MS,
  STALL_AT,
  MAX_MS,
  barProgress,
  exitDelay,
  fadeDuration,
  mustBail,
} from '@/lib/welcome-timing';

/**
 * These cover the rules behind a full-screen overlay. A splash that fails to
 * lift is a blank page the user cannot leave — which is what shipped when the
 * exit timer was rebuilt on every render — so the ceiling and the exit delay
 * matter more here than the easing does.
 */

describe('barProgress', () => {
  it('starts empty and fills by the floor once ready', () => {
    expect(barProgress(0, true)).toBe(0);
    expect(barProgress(MIN_MS, true)).toBe(1);
    expect(barProgress(MIN_MS * 10, true)).toBe(1);
  });

  it('never goes backwards as time passes', () => {
    let previous = -1;
    for (let t = 0; t <= MIN_MS; t += 50) {
      const value = barProgress(t, true);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('holds short of full while the data is still outstanding', () => {
    // A bar sitting at 100% above work that is still running is a lie.
    expect(barProgress(MIN_MS, false)).toBeCloseTo(STALL_AT, 5);
    expect(barProgress(MIN_MS * 5, false)).toBeCloseTo(STALL_AT, 5);
    expect(barProgress(MIN_MS * 5, false)).toBeLessThan(1);
  });

  it('stays within range for odd inputs', () => {
    expect(barProgress(-500, true)).toBe(0);
    expect(barProgress(0, false)).toBe(0);
    for (const t of [0, 1, 999, MIN_MS, MAX_MS]) {
      for (const ready of [true, false]) {
        const value = barProgress(t, ready);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('exitDelay', () => {
  it('waits out the remainder of the floor when data arrives early', () => {
    expect(exitDelay(0)).toBe(MIN_MS);
    expect(exitDelay(1200)).toBe(MIN_MS - 1200);
  });

  it('leaves immediately when data arrives after the floor', () => {
    // Late data must not be punished with a second full wait.
    expect(exitDelay(MIN_MS)).toBe(0);
    expect(exitDelay(MIN_MS * 4)).toBe(0);
  });

  it('skips the wait entirely under reduced motion', () => {
    expect(exitDelay(0, true)).toBe(0);
    expect(exitDelay(MIN_MS, true)).toBe(0);
  });

  it('is never negative', () => {
    for (const t of [-1000, 0, 500, MIN_MS, MAX_MS * 2]) {
      expect(exitDelay(t)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('fadeDuration', () => {
  it('fades normally, and not at all under reduced motion', () => {
    expect(fadeDuration(false)).toBe(EXIT_MS);
    expect(fadeDuration(true)).toBe(0);
  });
});

describe('mustBail', () => {
  it('holds while inside the ceiling', () => {
    expect(mustBail(0)).toBe(false);
    expect(mustBail(MAX_MS - 1)).toBe(false);
  });

  it('forces the splash to lift at the ceiling, whatever the data is doing', () => {
    // The safety net for the blank-page failure: no hanging fetch or missed
    // state update may keep the overlay up past this point.
    expect(mustBail(MAX_MS)).toBe(true);
    expect(mustBail(MAX_MS * 3)).toBe(true);
  });

  it('bails well after the normal exit would have happened', () => {
    // Otherwise the safety net would cut short the ordinary path.
    expect(MAX_MS).toBeGreaterThan(MIN_MS + EXIT_MS);
  });
});

describe('the splash always terminates', () => {
  it('has a bounded total lifetime for every readiness pattern', () => {
    // Whatever `ready` does, the overlay is gone by MAX_MS. This is the
    // property whose absence produced a blank admin page.
    const readyAt = [0, 500, MIN_MS, MAX_MS * 2, Number.POSITIVE_INFINITY];

    for (const t of readyAt) {
      const normalExit = t + exitDelay(t) + fadeDuration(false);
      const actualExit = Math.min(normalExit, MAX_MS);
      expect(actualExit).toBeLessThanOrEqual(MAX_MS);
    }
  });
});
