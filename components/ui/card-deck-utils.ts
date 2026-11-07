/** The arithmetic of a deck of cards. Pure, so the feel of it can be tested. */

export function wrap(i: number, n: number): number {
  return n ? ((i % n) + n) % n : 0;
}

/** The cards drawn behind the top one. A queue can hold fifty. */
export const VISIBLE_BEHIND = 3;

/** Whether a card this far down is drawn: the pile, and the one a step back pulls up. */
export function isDrawn(depth: number, n: number): boolean {
  return depth <= VISIBLE_BEHIND || depth === n - 1;
}

/** Resting pose of a card `depth` places down the pile. */
export function deckPose(depth: number, tilt: number, reduce = false) {
  const d = Math.min(depth, VISIBLE_BEHIND);
  return {
    y: -d * 14,
    scale: 1 - d * 0.04,
    rot: depth === 0 || reduce ? 0 : tilt,
    opacity: depth > VISIBLE_BEHIND ? 0 : 1,
    shade: 1 - d * 0.07,
  };
}

/** A stable, slightly random tilt per card, in [-max, max] degrees. */
export function tiltFor(i: number, max: number): number {
  const u = (((i + 1) * 2654435761) >>> 0) / 4294967296;
  return (u * 2 - 1) * max;
}

/** Did the drag end as a throw? dx in px, vx in px/ms, w = card width. */
export function isThrow(dx: number, vx: number, w: number): boolean {
  return Math.abs(dx) > w * 0.28 || (Math.abs(vx) > 0.55 && Math.abs(dx) > 24);
}

/** How far a press must travel to be a drag and not a tap on what the card holds. */
export const DRAG_START = 8;
