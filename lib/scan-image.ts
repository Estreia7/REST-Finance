/**
 * Image work for the document scanner: rotation, filters, and packing a page
 * for upload.
 *
 * Kept away from React so it can be tested on plain pixels, and so the camera
 * component stays about the camera. Everything here runs on a canvas in the
 * browser; nothing touches the network.
 *
 * The filters are the ones that actually help a photographed receipt get read:
 * thermal till rolls are low-contrast and often yellowed, and supplier invoices
 * are printed on white with a shadow across them from whoever is holding the
 * phone. Prettiness is not the goal — the extraction reading it correctly is.
 */

export type ScanFilter = 'original' | 'enhanced' | 'grayscale' | 'blackwhite';

export const SCAN_FILTERS: ScanFilter[] = ['original', 'enhanced', 'grayscale', 'blackwhite'];

/** Quarter turns clockwise. */
export type Rotation = 0 | 90 | 180 | 270;

export function nextRotation(current: Rotation): Rotation {
  return (((current + 90) % 360) as Rotation);
}

/**
 * Rotates a canvas by whole quarter turns.
 *
 * Only right angles, because a phone held sideways is the case that matters
 * and arbitrary angles would need interpolation that softens small print.
 */
export function rotateCanvas(source: HTMLCanvasElement, rotation: Rotation): HTMLCanvasElement {
  if (rotation === 0) return source;

  const swap = rotation === 90 || rotation === 270;
  const out = document.createElement('canvas');
  out.width = swap ? source.height : source.width;
  out.height = swap ? source.width : source.height;

  const ctx = out.getContext('2d');
  if (!ctx) return source;

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

/**
 * The paper, without what is printed on it: per channel, on a coarse grid.
 *
 * The same idea as the shadow removal every serious scanner app does (the
 * OpenCV recipe is dilate, then median, then blur): ink is dark and thin,
 * paper is bright and everywhere, so the brightest value in a neighbourhood is
 * the paper there. Doing it on a grid sized to the page, not in pixels, keeps
 * it fast on a 12-megapixel photo and makes the small preview match the page
 * that is uploaded.
 */
interface PaperMap {
  grid: Float32Array;
  gw: number;
  gh: number;
  cell: number;
}

/** Cells along the longest edge. A line of text is a few cells tall at most. */
const PAPER_GRID = 120;

function estimatePaper(data: Uint8ClampedArray, width: number, height: number): PaperMap {
  const cell = Math.max(2, Math.ceil(Math.max(width, height) / PAPER_GRID));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const step = Math.max(1, Math.floor(cell / 4));
  let grid: Float32Array = new Float32Array(gw * gh * 3);

  // 1. Brightest value per cell: removes strokes thinner than a cell.
  for (let gy = 0; gy < gh; gy++) {
    const y1 = Math.min(height, (gy + 1) * cell);
    for (let gx = 0; gx < gw; gx++) {
      const x1 = Math.min(width, (gx + 1) * cell);
      let r = 0, g = 0, b = 0;
      for (let y = gy * cell; y < y1; y += step) {
        for (let x = gx * cell; x < x1; x += step) {
          const i = (y * width + x) * 4;
          if (data[i] > r) r = data[i];
          if (data[i + 1] > g) g = data[i + 1];
          if (data[i + 2] > b) b = data[i + 2];
        }
      }
      const k = (gy * gw + gx) * 3;
      grid[k] = r; grid[k + 1] = g; grid[k + 2] = b;
    }
  }

  // 2. Dilate: bold titles, a QR code, a logo span several cells.
  grid = gridPass(grid, gw, gh, 2, (vals) => Math.max(...vals));
  // 3. Median: a glint or a speck of white must not become "the paper".
  grid = gridPass(grid, gw, gh, 1, median);
  // 4. Smooth, so the correction has no visible tiles.
  grid = gridPass(grid, gw, gh, 2, mean);
  grid = gridPass(grid, gw, gh, 2, mean);

  // Never divide by something much darker than the page's own paper: a large
  // dark area (a photo, a black logo, the table beyond the edge) would
  // otherwise be "corrected" to white.
  for (let c = 0; c < 3; c++) {
    const values: number[] = [];
    for (let k = c; k < grid.length; k += 3) values.push(grid[k]);
    values.sort((a, b) => a - b);
    const paper = values[Math.floor(values.length * 0.9)] ?? 255;
    const floor = Math.max(8, paper * 0.25);
    for (let k = c; k < grid.length; k += 3) if (grid[k] < floor) grid[k] = floor;
  }

  return { grid, gw, gh, cell };
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function mean(vals: number[]): number {
  let sum = 0;
  for (const v of vals) sum += v;
  return sum / vals.length;
}

/** A square neighbourhood operation over the grid, per channel. */
function gridPass(
  grid: Float32Array,
  gw: number,
  gh: number,
  radius: number,
  reduce: (vals: number[]) => number,
): Float32Array {
  const out = new Float32Array(grid.length);
  const vals: number[] = [];
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      for (let c = 0; c < 3; c++) {
        vals.length = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const y = gy + dy;
          if (y < 0 || y >= gh) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const x = gx + dx;
            if (x < 0 || x >= gw) continue;
            vals.push(grid[(y * gw + x) * 3 + c]);
          }
        }
        out[(gy * gw + gx) * 3 + c] = reduce(vals);
      }
    }
  }
  return out;
}

/**
 * Every pixel divided by the paper behind it, channel by channel.
 *
 * Division rather than subtraction because light multiplies: a shadow that
 * halves the paper also halves the ink, and dividing undoes both at once.
 * Doing it per channel is also the white balance — yellowed thermal paper is
 * yellow in the paper estimate too, so it comes out white.
 *
 * Writes ratios (1 = exactly the paper) into `out`, scaled to fit a lookup.
 */
const RATIO_BINS = 1024;
const RATIO_MAX = 1.25;

function paperRatios(data: Uint8ClampedArray, width: number, height: number): Uint16Array {
  const { grid, gw, gh, cell } = estimatePaper(data, width, height);
  const out = new Uint16Array(width * height * 3);
  const scale = (RATIO_BINS - 1) / RATIO_MAX;

  // Bilinear between cell centres, precomputed per column.
  const x0s = new Int32Array(width);
  const x1s = new Int32Array(width);
  const wxs = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
    x0s[x] = Math.floor(fx);
    x1s[x] = Math.min(gw - 1, x0s[x] + 1);
    wxs[x] = fx - x0s[x];
  }

  for (let y = 0; y < height; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const wy = fy - y0;
    const row0 = y0 * gw;
    const row1 = y1 * gw;

    for (let x = 0; x < width; x++) {
      const wx = wxs[x];
      const a = (row0 + x0s[x]) * 3;
      const b = (row0 + x1s[x]) * 3;
      const c = (row1 + x0s[x]) * 3;
      const d = (row1 + x1s[x]) * 3;
      const i = (y * width + x) * 4;
      const o = (y * width + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const top = grid[a + ch] + (grid[b + ch] - grid[a + ch]) * wx;
        const bottom = grid[c + ch] + (grid[d + ch] - grid[c + ch]) * wx;
        const paper = top + (bottom - top) * wy;
        const r = (data[i + ch] / paper) * scale;
        out[o + ch] = r >= RATIO_BINS - 1 ? RATIO_BINS - 1 : r;
      }
    }
  }
  return out;
}

/**
 * Where ink starts and paper ends, read off this page.
 *
 * Percentiles, as the whitepaper filters in the open-source scanners do,
 * rather than fixed numbers: a faint till roll and a laser-printed invoice
 * have very different darkest ink, and both should end up black.
 */
function inkAndPaperPoints(ratios: Uint16Array): { black: number; white: number } {
  const hist = new Uint32Array(RATIO_BINS);
  let n = 0;
  for (let o = 0; o < ratios.length; o += 3 * 3) {
    // Luminance-weighted, sampled every third pixel.
    const lum = 0.299 * ratios[o] + 0.587 * ratios[o + 1] + 0.114 * ratios[o + 2];
    hist[Math.round(lum)]++;
    n++;
  }
  const percentile = (p: number) => {
    const target = n * p;
    let acc = 0;
    for (let k = 0; k < RATIO_BINS; k++) {
      acc += hist[k];
      if (acc >= target) return k;
    }
    return RATIO_BINS - 1;
  };

  const unit = (RATIO_BINS - 1) / RATIO_MAX;
  // Paper is most of a page, so the 30th percentile is still paper — its
  // darker grain. Everything from there up is cut to clean white; faint
  // thermal print sits below it and survives.
  const white = Math.min(0.97 * unit, Math.max(0.6 * unit, Math.min(percentile(0.5) * 0.97, percentile(0.3))));
  // The darkest ink becomes black, but never stretched from less than a
  // 0.35 spread — a page of nothing must not be amplified into noise.
  const black = Math.min(percentile(0.005), white - 0.35 * unit);
  return { black, white };
}

/** Below this spread between channels a pixel is grey with a cast; above it, colour. */
const NEUTRAL_CHROMA = 30;

/** Above this the page's ink is genuinely coloured (blue pen), not a cast. */
const INK_CAST_LIMIT = 80;

/** Ratio → output level, with a gamma that firms up thin, faint strokes. */
function toneCurve(black: number, white: number, gamma: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(RATIO_BINS);
  for (let k = 0; k < RATIO_BINS; k++) {
    const t = Math.min(1, Math.max(0, (k - black) / (white - black)));
    lut[k] = Math.round(255 * Math.pow(t, gamma));
  }
  return lut;
}

/**
 * Applies a filter in place on the pixel buffer.
 *
 * `enhanced` is the default because it is the one that reliably rescues a
 * photograph: the paper is estimated locally and divided out, which removes
 * the shadow from the hand holding the phone, the dim end of a long till roll
 * and the yellow of thermal paper in one step, then the ink is stretched to
 * black. Colour is kept — a stamp or a supplier logo stays what it was.
 */
export function applyFilter(imageData: ImageData, filter: ScanFilter): ImageData {
  const { data, width, height } = imageData;

  if (filter === 'original') return imageData;

  if (filter === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = lum;
    }
    return imageData;
  }

  if (width === 0 || height === 0) return imageData;

  const ratios = paperRatios(data, width, height);
  const { black, white } = inkAndPaperPoints(ratios);
  const lut = toneCurve(black, white, 1.4);

  if (filter === 'enhanced') {
    // The page's typical ink colour. On a printed document that is black,
    // so a mild tint on it is the photograph's cast (warm kitchen light,
    // brown thermal print) and is taken out of the ink in proportion to how
    // dark each pixel is. A strong tint is a document actually written in
    // blue pen, and is left alone.
    let inkR = 0, inkG = 0, inkB = 0, inkN = 0;
    for (let p = 0; p < ratios.length; p += 3 * 3) {
      const r = lut[ratios[p]], g = lut[ratios[p + 1]], b = lut[ratios[p + 2]];
      if (0.299 * r + 0.587 * g + 0.114 * b < 128) {
        inkR += r; inkG += g; inkB += b; inkN++;
      }
    }
    let castR = 0, castG = 0, castB = 0;
    if (inkN > 0) {
      inkR /= inkN; inkG /= inkN; inkB /= inkN;
      const inkLum = 0.299 * inkR + 0.587 * inkG + 0.114 * inkB;
      if (Math.max(inkR, inkG, inkB) - Math.min(inkR, inkG, inkB) < INK_CAST_LIMIT) {
        castR = inkR - inkLum; castG = inkG - inkLum; castB = inkB - inkLum;
      }
    }

    for (let p = 0, i = 0; p < ratios.length; p += 3, i += 4) {
      let r = lut[ratios[p]];
      let g = lut[ratios[p + 1]];
      let b = lut[ratios[p + 2]];
      const dark = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      r -= castR * dark; g -= castG * dark; b -= castB * dark;
      // What is left with barely any colour is grey; a red stamp or a
      // supplier's logo is clearly coloured and is kept.
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const keep = chroma <= NEUTRAL_CHROMA ? 0 : Math.min(1, (chroma - NEUTRAL_CHROMA) / NEUTRAL_CHROMA);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      data[i] = lum + (r - lum) * keep;
      data[i + 1] = lum + (g - lum) * keep;
      data[i + 2] = lum + (b - lum) * keep;
    }
    return imageData;
  }

  // blackwhite: the same cleaned page, thresholded. Because the shading is
  // already gone, one threshold holds from the bright top of a receipt to
  // its dim bottom — which a threshold on the raw photo never could.
  for (let p = 0, i = 0; p < ratios.length; p += 3, i += 4) {
    const lum = 0.299 * lut[ratios[p]] + 0.587 * lut[ratios[p + 1]] + 0.114 * lut[ratios[p + 2]];
    const v = lum > 200 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return imageData;
}

/** Returns a new canvas with the filter applied; the source is left alone. */
export function filterCanvas(source: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  if (filter === 'original') return source;

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  ctx.putImageData(applyFilter(imageData, filter), 0, 0);
  return out;
}

/**
 * Longest edge a page is scaled to before upload.
 *
 * A modern phone photographs at well over 4000px, which costs upload time on a
 * restaurant's connection and buys nothing: the text stops getting easier to
 * read long before that. 2200 keeps small print on a supplier invoice legible.
 */
export const MAX_UPLOAD_EDGE = 2200;

/** Scales down if needed, and returns the canvas ready to encode. */
export function limitSize(source: HTMLCanvasElement, maxEdge = MAX_UPLOAD_EDGE): HTMLCanvasElement {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return source;

  const scale = maxEdge / longest;
  const out = document.createElement('canvas');
  out.width = Math.round(source.width * scale);
  out.height = Math.round(source.height * scale);

  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/**
 * Encodes a finished page for upload.
 *
 * JPEG at 0.9: the extraction reads text, and a higher quality only adds
 * megabytes. Black-and-white pages compress far smaller at the same setting.
 */
export function toDataUrl(canvas: HTMLCanvasElement, quality = 0.9): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/** Rotation, filter, downscale and encode, in the order that loses least. */
export function finishPage(
  source: HTMLCanvasElement,
  rotation: Rotation,
  filter: ScanFilter,
): string {
  // Rotate first so the filter's statistics are gathered over the same pixels
  // the reader will see, and downscale last so filtering works on full detail.
  const rotated = rotateCanvas(source, rotation);
  const filtered = filterCanvas(rotated, filter);
  return toDataUrl(limitSize(filtered));
}
