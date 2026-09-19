import { describe, it, expect } from 'vitest';
import {
  stabilityStep,
  maxCornerShift,
  areaRatio,
  isTrustworthy,
  STABLE_MS,
  STABLE_TOLERANCE,
  type Corners,
  type StabilityState,
} from '@/lib/scan-stability';

/**
 * A quad covering most of a 480x640 detector frame.
 *
 * `offset` slides it along x only, so a shift of n is a corner movement of
 * exactly n — moving both axes would make it n√2 and quietly cross the
 * tolerance the tests are written against.
 */
function quad(inset = 40, offset = 0): Corners {
  return {
    topLeft: { x: inset + offset, y: inset },
    topRight: { x: 480 - inset + offset, y: inset },
    bottomRight: { x: 480 - inset + offset, y: 640 - inset },
    bottomLeft: { x: inset + offset, y: 640 - inset },
  };
}

const FRESH: StabilityState = { previous: null, steadySince: null };

/** Feeds a series of readings in at a fixed interval, as the loop does. */
function run(
  readings: Array<{ corners: Corners | null; score?: number | null }>,
  intervalMs = 160,
) {
  let state = FRESH;
  const fired: number[] = [];
  readings.forEach((r, i) => {
    const now = i * intervalMs;
    const step = stabilityStep(state, r.corners, r.score, 480, 640, now);
    state = step.state;
    if (step.shouldCapture) fired.push(now);
  });
  return { state, fired };
}

describe('maxCornerShift', () => {
  it('is zero for an identical quad', () => {
    expect(maxCornerShift(quad(), quad())).toBe(0);
  });

  it('reports the largest single-corner movement', () => {
    const a = quad();
    const b = { ...quad(), topLeft: { x: a.topLeft.x + 3, y: a.topLeft.y + 4 } };
    // 3-4-5 triangle, and the other three corners have not moved.
    expect(maxCornerShift(a, b)).toBeCloseTo(5);
  });
});

describe('areaRatio', () => {
  it('measures a quad against the frame', () => {
    // A quad inset by 40px on a 480x640 frame: 400x560 of 480x640.
    expect(areaRatio(quad(40), 480, 640)).toBeCloseTo((400 * 560) / (480 * 640));
  });

  it('is not fooled by corner winding order', () => {
    const c = quad();
    const reversed: Corners = {
      topLeft: c.topLeft,
      topRight: c.bottomLeft,
      bottomRight: c.bottomRight,
      bottomLeft: c.topRight,
    };
    // Whichever way round it is wound, the area is positive.
    expect(areaRatio(reversed, 480, 640)).toBeGreaterThan(0);
  });

  it('returns zero for a frame with no size', () => {
    expect(areaRatio(quad(), 0, 0)).toBe(0);
  });
});

describe('isTrustworthy', () => {
  it('rejects a missing quad', () => {
    expect(isTrustworthy(null, 0.9, 480, 640)).toBe(false);
  });

  it('rejects a quad the detector does not believe in', () => {
    expect(isTrustworthy(quad(), 0.2, 480, 640)).toBe(false);
  });

  it('accepts a quad when the detector reports no score at all', () => {
    // The classical fallback returns null. Absence is not disbelief, or the
    // camera would never fire on a phone that could not load the model.
    expect(isTrustworthy(quad(), null, 480, 640)).toBe(true);
    expect(isTrustworthy(quad(), undefined, 480, 640)).toBe(true);
  });

  it('rejects a quad too small to be the page being photographed', () => {
    // A stamp in the corner of the frame, not a document.
    const tiny: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 40, y: 0 },
      bottomRight: { x: 40, y: 40 },
      bottomLeft: { x: 0, y: 40 },
    };
    expect(isTrustworthy(tiny, 0.9, 480, 640)).toBe(false);
  });
});

describe('stabilityStep', () => {
  it('does not fire on the very first reading', () => {
    const step = stabilityStep(FRESH, quad(), 0.9, 480, 640, 0);
    expect(step.shouldCapture).toBe(false);
    // Nothing to compare against yet, so it is not holding either.
    expect(step.holding).toBe(false);
  });

  it('fires once the quad has been still for STABLE_MS', () => {
    const readings = Array.from({ length: 12 }, () => ({ corners: quad(), score: 0.9 }));
    const { fired } = run(readings);
    expect(fired.length).toBeGreaterThan(0);
    // First reading establishes a baseline; the clock starts on the second.
    expect(fired[0]).toBeGreaterThanOrEqual(STABLE_MS);
  });

  it('does not fire early on a quad that was still drifting', () => {
    // The bug this guards: starting the clock on a moving frame banks one
    // interval of credit, and the shutter fires before STABLE_MS of stillness.
    const moving = [
      { corners: quad(40, 0), score: 0.9 },
      { corners: quad(40, 30), score: 0.9 },
    ];
    const settled = Array.from({ length: 12 }, () => ({ corners: quad(40, 30), score: 0.9 }));
    const { fired } = run([...moving, ...settled]);

    // Stillness only begins at the third reading (320ms), so the earliest
    // legitimate capture is 320 + STABLE_MS.
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0]).toBeGreaterThanOrEqual(320 + STABLE_MS);
  });

  it('restarts the clock when the page is moved', () => {
    const still = Array.from({ length: 4 }, () => ({ corners: quad(), score: 0.9 }));
    const moved = { corners: quad(40, 50), score: 0.9 };
    const { state } = run([...still, moved]);
    expect(state.steadySince).toBeNull();
  });

  it('tolerates the tremor of a hand-held phone', () => {
    // Movement within tolerance must still count as still, or the shutter
    // never fires for a person actually holding the phone.
    const nudge = STABLE_TOLERANCE - 1;
    const readings = Array.from({ length: 12 }, (_, i) => ({
      corners: quad(40, i % 2 === 0 ? 0 : nudge),
      score: 0.9,
    }));
    const { fired } = run(readings);
    expect(fired.length).toBeGreaterThan(0);
  });

  it('does not fire while the quad keeps sliding across the frame', () => {
    // Each step exceeds the tolerance, so it never settles.
    const readings = Array.from({ length: 20 }, (_, i) => ({
      corners: quad(40, i * (STABLE_TOLERANCE + 4)),
      score: 0.9,
    }));
    const { fired } = run(readings);
    expect(fired).toHaveLength(0);
  });

  it('clears the clock when the document is lost', () => {
    const still = Array.from({ length: 4 }, () => ({ corners: quad(), score: 0.9 }));
    const { state } = run([...still, { corners: null, score: null }]);
    expect(state.steadySince).toBeNull();
    expect(state.previous).toBeNull();
  });

  it('reports holding only while the quad is settling', () => {
    let state = FRESH;
    const first = stabilityStep(state, quad(), 0.9, 480, 640, 0);
    state = first.state;
    expect(first.holding).toBe(false);

    const second = stabilityStep(state, quad(), 0.9, 480, 640, 160);
    expect(second.holding).toBe(true);
  });

  it('works for a detector that reports no confidence', () => {
    // The classical fallback path: geometry is the only evidence there is.
    const readings = Array.from({ length: 12 }, () => ({ corners: quad(), score: null }));
    const { fired } = run(readings);
    expect(fired.length).toBeGreaterThan(0);
  });
});
