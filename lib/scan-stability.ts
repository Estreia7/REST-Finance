/**
 * Deciding when the camera has settled enough to take the photograph itself.
 *
 * The owner is holding a phone over a till roll with one hand at the end of
 * service. Asking them to also find the shutter is the part that goes wrong,
 * so the camera fires once the outline has stopped moving — the same moment a
 * person would have pressed the button.
 *
 * Kept out of the camera component because this is the part that decides
 * whether a photograph is taken at the right moment, and it is pure geometry:
 * testable here, unreachable behind a live video stream.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Corners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/**
 * How long the quad must hold still before the shutter fires.
 *
 * Long enough to be a steady hand rather than a pause on the way past, short
 * enough that the owner does not give up and reach for the button.
 */
export const STABLE_MS = 900;

/**
 * How far a corner may drift between checks and still count as still, in
 * detector pixels. Generous enough for the tremor of a held phone, tight
 * enough that a page being moved into place does not qualify.
 */
export const STABLE_TOLERANCE = 6;

/**
 * Below this the ML detector is unsure there is a document at all. Only
 * consulted when the detector reports it: the classical fallback returns
 * null, and there a steady quad is the only evidence available.
 */
export const MIN_SCORE = 0.5;

/** Ignores a quad too small to be the page the owner means to photograph. */
export const MIN_AREA_RATIO = 0.12;

/** The largest distance any one corner has moved between two readings. */
export function maxCornerShift(a: Corners, b: Corners): number {
  return Math.max(...CORNER_KEYS.map((k) => Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y)));
}

/** Quad area over frame area, by the shoelace formula. */
export function areaRatio(c: Corners, width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  const pts = CORNER_KEYS.map((k) => c[k]);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2 / (width * height);
}

/**
 * Whether a reading is worth starting the clock on at all: a real quad, one
 * the detector believes in where it says so, and big enough to be the page
 * rather than a stamp in the corner of it.
 */
export function isTrustworthy(
  corners: Corners | null,
  score: number | null | undefined,
  width: number,
  height: number,
): corners is Corners {
  if (!corners) return false;
  // `score` is null on the classical detector; absence is not disbelief.
  if (typeof score === 'number' && score < MIN_SCORE) return false;
  if (areaRatio(corners, width, height) < MIN_AREA_RATIO) return false;
  // Big enough is not the same as page-shaped: a detector can return a
  // confident quad around a QR code, which is square and high-contrast and
  // everything it is looking for.
  return isPageShaped(corners);
}

/** What the camera should do with the reading it just took. */
export interface StabilityState {
  /** The reading to compare the next one against. */
  previous: Corners | null;
  /** When the quad was first seen to be still, or null if it is moving. */
  steadySince: number | null;
}

export interface StabilityStep {
  state: StabilityState;
  /** True once the quad has held still for STABLE_MS. */
  shouldCapture: boolean;
  /** True while the quad is settling, for the "hold still" message. */
  holding: boolean;
}

/**
 * Advances the stability tracker by one detection.
 *
 * Written as a pure step over explicit state so the timing can be tested
 * without a camera: the component keeps the state in refs and feeds each
 * reading through here.
 */
export function stabilityStep(
  state: StabilityState,
  corners: Corners | null,
  score: number | null | undefined,
  width: number,
  height: number,
  now: number,
): StabilityStep {
  if (!isTrustworthy(corners, score, width, height)) {
    return { state: { previous: corners, steadySince: null }, shouldCapture: false, holding: false };
  }

  const still =
    state.previous !== null && maxCornerShift(state.previous, corners) <= STABLE_TOLERANCE;

  if (!still) {
    // Cleared rather than started at `now`: the clock has to start on a frame
    // that was actually still, or a quad still drifting would bank one
    // interval of credit towards the shutter.
    return { state: { previous: corners, steadySince: null }, shouldCapture: false, holding: false };
  }

  const steadySince = state.steadySince ?? now;
  return {
    state: { previous: corners, steadySince },
    shouldCapture: now - steadySince >= STABLE_MS,
    holding: true,
  };
}

/**
 * Whether a quad is shaped like a page rather than like something printed on
 * one.
 *
 * Area alone does not catch it. The QR code on a Makro invoice is square,
 * high-contrast and sits in a corner — everything a document detector looks
 * for — and a detector that finds it returns a confident, well-formed quad
 * around the wrong thing.
 *
 * Two tests, both about shape:
 *
 *   - **Opposite sides** should roughly match. A sheet photographed at an
 *     angle is a trapezium, not a triangle, so a top five times its own
 *     bottom is not perspective, it is a misdetection.
 *   - **Aspect** should be plausible for paper. A quad four times wider than
 *     tall is a strip, not a page.
 *
 * Deliberately loose. A page held at a steep angle is a real photograph and
 * refusing it would send the owner to the manual crop for something that
 * would have read perfectly.
 */
export const MIN_SIDE_RATIO = 0.45;
export const MAX_ASPECT = 4;

export function isPageShaped(c: Corners): boolean {
  const side = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  const top = side(c.topLeft, c.topRight);
  const right = side(c.topRight, c.bottomRight);
  const bottom = side(c.bottomRight, c.bottomLeft);
  const left = side(c.bottomLeft, c.topLeft);

  // A degenerate quad has collapsed to a line or a point.
  if (Math.min(top, right, bottom, left) < 1) return false;

  const horizontal = Math.min(top, bottom) / Math.max(top, bottom);
  const vertical = Math.min(left, right) / Math.max(left, right);
  if (horizontal < MIN_SIDE_RATIO || vertical < MIN_SIDE_RATIO) return false;

  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  const aspect = Math.max(width, height) / Math.min(width, height);
  return aspect <= MAX_ASPECT;
}
