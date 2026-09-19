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
 * Mean and standard deviation of luminance, sampled rather than exhaustive.
 *
 * A full pass over a 12-megapixel photo is wasted work when every fourth row
 * and column answers the same question to well within a grey level.
 */
function luminanceStats(data: Uint8ClampedArray, width: number, height: number) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
  }

  if (n === 0) return { mean: 128, std: 64 };
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Applies a filter in place on the pixel buffer.
 *
 * `enhanced` is the default because it is the one that reliably rescues a
 * photograph: it stretches contrast around the image's own mean rather than a
 * fixed midpoint, so a dim thermal receipt and a bright invoice both come out
 * legible without either being crushed.
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

  const { mean, std } = luminanceStats(data, width, height);

  if (filter === 'enhanced') {
    // Centre on the image's own mean and stretch. The gain is capped so a
    // near-flat photo is not amplified into noise.
    const gain = Math.min(2.2, 64 / Math.max(18, std));
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = (data[i + c] - mean) * gain + 150;
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    return imageData;
  }

  // blackwhite: threshold relative to the mean, which survives an uneven
  // shadow far better than a fixed 128 would.
  const threshold = mean - std * 0.45;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = lum > threshold ? 255 : 0;
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
