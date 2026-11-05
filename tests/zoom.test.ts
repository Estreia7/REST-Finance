import { describe, it, expect } from 'vitest';
import { FIT, MAX_SCALE, clampView, panBy, zoomAt } from '@/lib/zoom';

const box = { width: 400, height: 800 };

describe('zoomAt', () => {
  it('holds the point under the finger still', () => {
    const view = zoomAt(FIT, 2, 100, 200, box);
    expect(view.scale).toBe(2);
    expect(100 - view.x).toBeCloseTo(100 * 2);
    expect(200 - view.y).toBeCloseTo(200 * 2);
  });

  it('stops at the closest it can go, and at the whole page', () => {
    expect(zoomAt(FIT, 100, 0, 0, box).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 2, x: -100, y: -100 }, 0.1, 0, 0, box)).toEqual(FIT);
  });
});

describe('panBy', () => {
  it('moves a zoomed page', () => {
    expect(panBy({ scale: 2, x: -100, y: -100 }, 30, -40, box)).toEqual({ scale: 2, x: -70, y: -140 });
  });

  it('does not let the page leave the screen', () => {
    expect(panBy({ scale: 2, x: 0, y: 0 }, 50, 50, box)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(panBy({ scale: 2, x: -400, y: -800 }, -50, -50, box)).toEqual({ scale: 2, x: -400, y: -800 });
  });

  it('does nothing to a page at its whole size', () => {
    expect(panBy(FIT, 80, 80, box)).toEqual(FIT);
  });
});

describe('clampView', () => {
  it('pulls a page back in after the box changes', () => {
    expect(clampView({ scale: 2, x: -900, y: 0 }, box).x).toBe(-400);
  });
});
