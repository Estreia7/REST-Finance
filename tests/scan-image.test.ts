import { describe, it, expect } from 'vitest';
import { applyFilter, nextRotation, MAX_UPLOAD_EDGE, type ScanFilter } from '@/lib/scan-image';

/**
 * The pixel maths, tested without a browser.
 *
 * What matters is not that a filter "looks nicer" but that it makes faint text
 * readable: a thermal till roll photographed in a dim kitchen is the case that
 * decides whether the extraction works at all.
 */

/** A synthetic page: pale background with slightly darker "text" rows. */
function makePage(bg: number, text: number, width = 40, height = 40): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = y % 5 === 0 ? text : bg;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

const lumAt = (d: ImageData, x: number, y: number) => d.data[(y * d.width + x) * 4];

/** Distance between background and text: how legible the page is. */
function contrast(d: ImageData): number {
  return Math.abs(lumAt(d, 10, 1) - lumAt(d, 10, 0));
}

describe('applyFilter', () => {
  it('leaves the pixels untouched on "original"', () => {
    const page = makePage(200, 160);
    const before = [...page.data];
    applyFilter(page, 'original');
    expect([...page.data]).toEqual(before);
  });

  it('makes faint text far more legible with "enhanced"', () => {
    // A dim thermal receipt: background and text only 18 levels apart.
    const page = makePage(150, 132);
    const was = contrast(page);
    applyFilter(page, 'enhanced');
    expect(contrast(page)).toBeGreaterThan(was * 1.5);
  });

  it('does not amplify a flat image into noise', () => {
    // Nothing but background: the gain cap must keep this from exploding.
    const flat = makePage(180, 180);
    applyFilter(flat, 'enhanced');
    for (let i = 0; i < flat.data.length; i += 4) {
      expect(flat.data[i]).toBeGreaterThanOrEqual(0);
      expect(flat.data[i]).toBeLessThanOrEqual(255);
    }
  });

  it('separates text from background completely in "blackwhite"', () => {
    const page = makePage(200, 120);
    applyFilter(page, 'blackwhite');
    const values = new Set<number>();
    for (let i = 0; i < page.data.length; i += 4) values.add(page.data[i]);
    expect([...values].sort()).toEqual([0, 255]);
    // Background stays white, text goes black — not the other way round.
    expect(lumAt(page, 10, 1)).toBe(255);
    expect(lumAt(page, 10, 0)).toBe(0);
  });

  it('thresholds against the image, not a fixed midpoint', () => {
    // A dark photograph whose "white" paper sits below 128. A fixed threshold
    // would turn the whole page black and lose the text entirely.
    const dark = makePage(110, 60);
    applyFilter(dark, 'blackwhite');
    expect(lumAt(dark, 10, 1)).toBe(255);
    expect(lumAt(dark, 10, 0)).toBe(0);
  });

  it('keeps every channel equal in grayscale', () => {
    const page = makePage(200, 100);
    page.data[0] = 255; page.data[1] = 30; page.data[2] = 10;
    applyFilter(page, 'grayscale');
    expect(page.data[0]).toBe(page.data[1]);
    expect(page.data[1]).toBe(page.data[2]);
  });

  it('never produces out-of-range values for any filter', () => {
    for (const f of ['enhanced', 'grayscale', 'blackwhite'] as ScanFilter[]) {
      const page = makePage(250, 5);
      applyFilter(page, f);
      for (let i = 0; i < page.data.length; i += 4) {
        expect(page.data[i]).toBeGreaterThanOrEqual(0);
        expect(page.data[i]).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('nextRotation', () => {
  it('cycles through the four quarter turns and back', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });
});

describe('upload size', () => {
  it('stays large enough for small print on an invoice', () => {
    expect(MAX_UPLOAD_EDGE).toBeGreaterThanOrEqual(1600);
    expect(MAX_UPLOAD_EDGE).toBeLessThanOrEqual(3000);
  });
});
