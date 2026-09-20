/**
 * Turning a picked file into what the page editor expects.
 *
 * A photograph chosen from the gallery is the same thing as one taken through
 * the camera: a picture of a document that needs its corners found and its
 * perspective corrected. The only difference is that nobody was pointing a
 * lens at it a moment ago, so the corners were never detected live.
 *
 * This runs the detector once over the loaded image, which gives a file from
 * the gallery the same automatic crop as a live capture. Without it, choosing
 * an existing photograph drops the owner into an editor showing the whole
 * frame — table, keyboard and all — and asks them to drag four corners that
 * the app could have found itself.
 */

import type { Corners } from '@/lib/scan-stability';

/** Width the detector sees. Matching DocumentCamera: shape, not detail. */
const DETECT_WIDTH = 480;

/** Same model and asset paths the live camera uses. */
const DETECTOR_OPTIONS = {
  detector: 'ml' as const,
  ml: {
    assetBaseUrl: '/scanner/',
    modelUrl: '/scanner/doccornernet_lean.ort',
    wasmPaths: '/scanner/',
  },
};

export interface LoadedFrame {
  frame: HTMLCanvasElement;
  corners: Corners | null;
}

/**
 * Reads an image file into a canvas and finds the document in it.
 *
 * The frame is kept at the image's own resolution — downscaling before the
 * crop would throw away the detail the extraction depends on. Detection runs
 * on a small copy, and the corners are scaled back up.
 *
 * Corners come back null when nothing is found, which the editor already
 * handles by offering a default quad to drag.
 */
export async function loadFrameFromFile(file: File): Promise<LoadedFrame> {
  const frame = await fileToCanvas(file);

  let corners: Corners | null = null;
  try {
    const { scanDocument } = await import('scanic');

    const small = document.createElement('canvas');
    const ratio = frame.height / frame.width;
    small.width = DETECT_WIDTH;
    small.height = Math.round(DETECT_WIDTH * ratio);

    const ctx = small.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(frame, 0, 0, small.width, small.height);
      const result = await scanDocument(small, DETECTOR_OPTIONS);

      if (result?.corners) {
        // Detector coordinates are on the small copy; the editor works
        // against the full frame.
        const scale = frame.width / DETECT_WIDTH;
        const c = result.corners;
        corners = {
          topLeft: { x: c.topLeft.x * scale, y: c.topLeft.y * scale },
          topRight: { x: c.topRight.x * scale, y: c.topRight.y * scale },
          bottomRight: { x: c.bottomRight.x * scale, y: c.bottomRight.y * scale },
          bottomLeft: { x: c.bottomLeft.x * scale, y: c.bottomLeft.y * scale },
        };
      }
    }
  } catch {
    // A missing model or a detector that cannot read this image is not a
    // failure: the editor opens on the whole frame with corners to drag,
    // which is exactly what it does when detection finds nothing.
  }

  return { frame, corners };
}

/** Decodes an image file to a canvas at its own resolution. */
function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas unavailable'));
        return;
      }
      ctx.drawImage(image, 0, 0);
      resolve(canvas);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not decode image'));
    };

    image.src = url;
  });
}
