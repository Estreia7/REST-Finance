import { describe, it, expect } from 'vitest';
import {
  toGreyscale,
  laplacianVariance,
  brightnessStats,
  judge,
} from '@/lib/image-quality';

/** An image of hard vertical stripes: the sharpest thing text ever is. */
function stripes(width: number, height: number, period = 4): Float32Array {
  const grey = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      grey[y * width + x] = Math.floor(x / period) % 2 === 0 ? 20 : 235;
    }
  }
  return grey;
}

/** The same stripes smeared, which is what a moving hand does to them. */
function blurred(grey: Float32Array, width: number, height: number, passes = 3): Float32Array {
  let current = grey;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
            sum += current[yy * width + xx];
            n++;
          }
        }
        next[y * width + x] = sum / n;
      }
    }
    current = next;
  }
  return current;
}

function flat(width: number, height: number, value: number): Float32Array {
  return new Float32Array(width * height).fill(value);
}

describe('measuring focus', () => {
  const W = 120;
  const H = 90;

  it('scores sharp edges far above blurred ones', () => {
    // The whole measurement rests on this: if blur did not collapse the
    // number, nothing downstream would mean anything.
    const sharp = laplacianVariance(stripes(W, H), W, H);
    const soft = laplacianVariance(blurred(stripes(W, H), W, H), W, H);
    expect(sharp).toBeGreaterThan(soft * 10);
  });

  it('scores a blank image at nothing', () => {
    // No detail anywhere, so no variance. A photograph of a wall.
    expect(laplacianVariance(flat(W, H, 128), W, H)).toBeCloseTo(0, 5);
  });

  it('does not divide by zero on an image too small to measure', () => {
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(0);
    expect(laplacianVariance(new Float32Array(0), 0, 0)).toBe(0);
  });
});

describe('measuring light', () => {
  it('reads the mean brightness', () => {
    expect(brightnessStats(flat(10, 10, 200)).brightness).toBeCloseTo(200, 5);
  });

  it('reads no spread in a flat image', () => {
    expect(brightnessStats(flat(10, 10, 128)).contrast).toBeCloseTo(0, 5);
  });

  it('reads a wide spread in a high-contrast one', () => {
    // Ink on paper: the two extremes and little between.
    expect(brightnessStats(stripes(40, 40)).contrast).toBeGreaterThan(90);
  });

  it('survives an empty image', () => {
    expect(brightnessStats(new Float32Array(0))).toEqual({ brightness: 0, contrast: 0 });
  });
});

describe('deciding what to tell the owner', () => {
  const sharp = { sharpness: 400, brightness: 150, contrast: 70 };

  it('passes a sharp, well-lit photograph', () => {
    expect(judge(sharp).verdict).toBe('good');
    expect(judge(sharp).reason).toBeNull();
  });

  it('refuses a badly blurred one outright', () => {
    // This is the failure that produces confident nonsense — names that are
    // nearly words and figures that are nearly right.
    const check = judge({ ...sharp, sharpness: 20 });
    expect(check.verdict).toBe('unusable');
    expect(check.reason).toBe('blurry');
  });

  it('refuses one taken in the dark, where dark means unreadable', () => {
    // Dark on its own is not a fault: light text on a dark ground reads
    // perfectly and measures a low mean. It is dark *and* soft that means
    // nothing can be made out.
    const check = judge({ sharpness: 60, brightness: 30, contrast: 40 });
    expect(check.verdict).toBe('unusable');
    expect(check.reason).toBe('dark');
  });

  it('does not call a sharp dark image a problem', () => {
    expect(judge({ ...sharp, brightness: 30 }).verdict).toBe('good');
  });

  it('warns about a marginal one rather than refusing it', () => {
    // Worth a word, not worth blocking: the owner sees the extracted figures
    // on the review screen either way.
    const check = judge({ ...sharp, sharpness: 80 });
    expect(check.verdict).toBe('poor');
    expect(check.reason).toBe('blurry');
  });

  it('warns about a washed-out one', () => {
    const check = judge({ ...sharp, contrast: 15 });
    expect(check.verdict).toBe('poor');
    expect(check.reason).toBe('flat');
  });

  it('calls blur first when a photograph is both blurred and dark', () => {
    // Retaking for the blur fixes the reading; brightening a blurred
    // photograph does not.
    expect(judge({ sharpness: 20, brightness: 30, contrast: 70 }).reason).toBe('blurry');
  });
});

describe('preparing the pixels', () => {
  it('turns colour into luma', () => {
    // Pure red at Rec. 601 weighting: 0.299 × 255.
    const data = new Uint8ClampedArray([255, 0, 0, 255]);
    const { grey } = toGreyscale(data, 1, 1);
    expect(grey[0]).toBeCloseTo(76.2, 1);
  });

  it('downsamples a large photograph', () => {
    // Sensor noise in a 12-megapixel photograph reads as fine detail and
    // flatters the sharpness measurement, so it is sampled down first.
    const big = new Uint8ClampedArray(4000 * 3000 * 4);
    const { width, height } = toGreyscale(big, 4000, 3000);
    expect(width).toBeLessThan(4000);
    expect(width * height).toBeLessThan(4000 * 3000);
  });

  it('leaves a small image at its own size', () => {
    const small = new Uint8ClampedArray(100 * 80 * 4);
    const { width, height } = toGreyscale(small, 100, 80);
    expect(width).toBe(100);
    expect(height).toBe(80);
  });
});

describe('end to end on synthetic documents', () => {
  const W = 160;
  const H = 120;

  it('passes a sharp page', () => {
    const grey = stripes(W, H);
    const check = judge({
      sharpness: laplacianVariance(grey, W, H),
      ...brightnessStats(grey),
    });
    expect(check.verdict).toBe('good');
  });

  it('refuses the same page photographed with a moving hand', () => {
    const grey = blurred(stripes(W, H), W, H, 4);
    const check = judge({
      sharpness: laplacianVariance(grey, W, H),
      ...brightnessStats(grey),
    });
    expect(check.verdict).not.toBe('good');
    expect(check.reason).toBe('blurry');
  });

  it('refuses the same page photographed in a dark kitchen', () => {
    const grey = stripes(W, H).map((v) => v * 0.15) as Float32Array;
    const check = judge({
      sharpness: laplacianVariance(grey, W, H),
      ...brightnessStats(grey),
    });
    expect(check.verdict).not.toBe('good');
  });
});

describe('readings taken from real photographs', () => {
  /**
   * Measured from the files an owner actually sent, which is what moved the
   * thresholds off their first guesses.
   */
  it('refuses the out-of-focus invoice', () => {
    // A 900×1600 photograph of a Makro invoice: sharpness 63, and the model
    // read "MC BOL.SPECULOOS" as "SAL ESPECIOSOS" from it.
    const check = judge({ sharpness: 63, brightness: 158, contrast: 37 });
    expect(check.verdict).toBe('poor');
    expect(check.reason).toBe('blurry');
  });

  it('accepts a screenshot of a dark-themed page', () => {
    // Mean brightness 36 — light text on a dark ground, and among the
    // clearest documents anyone can send. The first version of this refused
    // it for being "too dark", which would have been absurd.
    expect(judge({ sharpness: 3687, brightness: 36, contrast: 41 }).verdict).toBe('good');
    expect(judge({ sharpness: 1528, brightness: 48, contrast: 47 }).verdict).toBe('good');
  });

  it('still refuses something genuinely lost in the dark', () => {
    // Dark and soft together is a photograph taken in an unlit kitchen.
    const check = judge({ sharpness: 60, brightness: 30, contrast: 20 });
    expect(check.verdict).toBe('unusable');
    expect(check.reason).toBe('dark');
  });
});
