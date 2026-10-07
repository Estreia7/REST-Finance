/**
 * Whether a photograph of a document is good enough to read.
 *
 * A blurred invoice does not fail loudly. The model reads it, returns names
 * that are nearly words and figures that are nearly right, and the owner
 * saves a purchase that never happened at a price nobody charged. Catching
 * that after the fact means catching it never.
 *
 * So the photograph is measured before it is sent. Two things go wrong with
 * a phone photograph of paper, and they are different problems:
 *
 *   - **blur**, from a moving hand or a camera that focused on the table
 *   - **darkness**, from a kitchen at night, where the text is there but the
 *     contrast between ink and paper has collapsed
 *
 * Measured locally, in a few milliseconds, with no network and no cost. A
 * retake asked for now is worth far more than a correction asked for later.
 */

export interface QualityReading {
  /**
   * How much fine detail the image carries, as the variance of the
   * Laplacian. Sharp text has hard edges and a high variance; blur smooths
   * them away and the number collapses.
   */
  sharpness: number;
  /** Mean brightness, 0–255. */
  brightness: number;
  /** Spread of brightness. Flat, washed-out images have little. */
  contrast: number;
}

export type QualityVerdict = 'good' | 'poor' | 'unusable';

export interface QualityCheck extends QualityReading {
  verdict: QualityVerdict;
  /** Which test it failed, for telling the owner what to change. */
  reason: 'blurry' | 'dark' | 'flat' | null;
}

/**
 * Thresholds, in the units the measurements return.
 *
 * Deliberately generous. A photograph good enough to read that gets refused
 * teaches an owner to distrust the whole feature, where a marginal one that
 * gets through is corrected on the review screen they see anyway. So the bar
 * is set where a reading is genuinely unlikely to be usable rather than
 * where it is merely imperfect.
 */
const SHARP_ENOUGH = 120;
const DEFINITELY_BLURRED = 45;
const DARK = 55;
const FLAT = 28;

/**
 * Converts to greyscale at a reduced size.
 *
 * Downsampling first is not a shortcut: a 12-megapixel photograph of a sheet
 * of A4 carries sensor noise that reads as fine detail and flatters the
 * sharpness measurement. Around a megapixel is where the text's own edges
 * dominate.
 */
export function toGreyscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { grey: Float32Array; width: number; height: number } {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 1_000_000)));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const grey = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y * step) * width + x * step) * 4;
      // Rec. 601 luma: the eye's own weighting, and what makes ink on paper
      // separate from the paper.
      grey[y * w + x] =
        0.299 * data[src] + 0.587 * data[src + 1] + 0.114 * data[src + 2];
    }
  }

  return { grey, width: w, height: h };
}

/**
 * The variance of the Laplacian: the standard measure of focus.
 *
 * The Laplacian is the second derivative, so it answers "how fast is
 * brightness changing, and is that change itself changing" — which is what
 * an edge is. Text is edges. Blur spreads each edge over many pixels, the
 * second derivative falls everywhere, and the variance with it.
 */
export function laplacianVariance(grey: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum += value;
      sumSq += value * value;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/** Mean brightness and its spread. */
export function brightnessStats(grey: Float32Array): { brightness: number; contrast: number } {
  if (grey.length === 0) return { brightness: 0, contrast: 0 };

  let sum = 0;
  for (let i = 0; i < grey.length; i++) sum += grey[i];
  const brightness = sum / grey.length;

  let sumSq = 0;
  for (let i = 0; i < grey.length; i++) {
    const d = grey[i] - brightness;
    sumSq += d * d;
  }

  return { brightness, contrast: Math.sqrt(sumSq / grey.length) };
}

/**
 * What to do about a photograph.
 *
 * Blur is checked first, because it is the failure that produces confident
 * nonsense: a dark photograph usually yields a reading that is obviously
 * incomplete, while a blurred one yields names that are nearly words.
 */
export function judge(reading: QualityReading): QualityCheck {
  const { sharpness, brightness, contrast } = reading;

  if (sharpness < DEFINITELY_BLURRED) {
    return { ...reading, verdict: 'unusable', reason: 'blurry' };
  }

  // Darkness only matters when there is nothing to read in it. A sharp
  // image with a low mean is light text on a dark ground — a screenshot
  // of a dark-themed page reads at a mean of 36 and is perfectly legible,
  // and refusing it for being "too dark" would be refusing one of the
  // clearest documents an owner can send.
  if (brightness < DARK && sharpness < SHARP_ENOUGH) {
    return { ...reading, verdict: 'unusable', reason: 'dark' };
  }
  if (sharpness < SHARP_ENOUGH) {
    return { ...reading, verdict: 'poor', reason: 'blurry' };
  }
  if (contrast < FLAT) {
    return { ...reading, verdict: 'poor', reason: 'flat' };
  }

  return { ...reading, verdict: 'good', reason: null };
}

/**
 * Measures a photograph in the browser.
 *
 * Returns null where it cannot be measured — no canvas, a file that is not an
 * image, a decoder that refuses. A quality check that cannot run must let the
 * scan proceed: refusing a photograph because the measurement failed would
 * block an owner over a browser quirk they cannot do anything about.
 */
export async function measureImage(source: Blob): Promise<QualityCheck | null> {
  try {
    if (typeof document === 'undefined') return null;

    const bitmap = await createImageBitmap(source);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return null;
    }

    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    const { grey, width, height } = toGreyscale(pixels.data, bitmap.width, bitmap.height);
    const sharpness = laplacianVariance(grey, width, height);
    const { brightness, contrast } = brightnessStats(grey);

    return judge({ sharpness, brightness, contrast });
  } catch {
    return null;
  }
}
