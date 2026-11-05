/**
 * Where a zoomed picture sits, kept apart from the gestures that move it.
 *
 * The picture is drawn with its top-left at (x, y) and `scale` times its fitted
 * size. Pure, so the arithmetic that keeps a page on screen can be tested
 * without fingers.
 */

export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export const FIT: ZoomView = { scale: 1, x: 0, y: 0 };

export const MAX_SCALE = 6;

/** The scale a double tap goes to: enough to read small print. */
export const CLOSE_UP = 2.5;

interface Box {
  width: number;
  height: number;
}

/** Keeps the picture covering the box, so it can never be dragged away. */
export function clampView(view: ZoomView, box: Box): ZoomView {
  const scale = Math.min(MAX_SCALE, Math.max(1, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(box.width * (1 - scale), view.x)),
    y: Math.min(0, Math.max(box.height * (1 - scale), view.y)),
  };
}

/** Zooms by a factor, holding the point under the finger or cursor still. */
export function zoomAt(view: ZoomView, factor: number, px: number, py: number, box: Box): ZoomView {
  const scale = Math.min(MAX_SCALE, Math.max(1, view.scale * factor));
  const ratio = scale / view.scale;
  return clampView({ scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }, box);
}

/** Moves the picture by a drag. */
export function panBy(view: ZoomView, dx: number, dy: number, box: Box): ZoomView {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, box);
}
