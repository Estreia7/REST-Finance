/**
 * The welcome splash's timing rules, kept apart from the component.
 *
 * These decide when a full-screen overlay lifts, so getting them wrong leaves
 * the user staring at a blank page with no way forward — which is exactly what
 * happened when the exit timer lived inline and was cancelled on every render.
 * Pure functions of elapsed time and readiness, so the rules can be tested
 * without mounting anything or waiting in real time.
 */

/** Floor for the whole splash: long enough to read the line, short enough not to annoy. */
export const MIN_MS = 3200;
/** Length of the fade-out once both the floor and the data are done. */
export const EXIT_MS = 520;
/** Where the bar waits when the data is still loading past the floor. */
export const STALL_AT = 0.94;
/**
 * Absolute ceiling. Past this the splash lifts whatever the data is doing:
 * a full-screen overlay that never leaves is a blank page, and the dashboard
 * behind it handles a failed load on its own.
 */
export const MAX_MS = 10000;

/**
 * How full the progress bar should be.
 *
 * Eased so the bar moves confidently at first and settles at the end. While
 * the data is still outstanding it holds at STALL_AT rather than completing,
 * so a full bar never sits above work that is still running.
 */
export function barProgress(elapsedMs: number, ready: boolean): number {
  const linear = Math.min(Math.max(elapsedMs, 0) / MIN_MS, 1);
  const eased = 1 - Math.pow(1 - linear, 2.2);
  return ready ? eased : Math.min(eased, STALL_AT);
}

/**
 * How long to wait before starting the fade-out, given how long the splash has
 * already been up. Zero once the floor has passed, so late data leaves at once
 * rather than serving a second full wait.
 */
export function exitDelay(elapsedMs: number, reducedMotion = false): number {
  const floor = reducedMotion ? 0 : MIN_MS;
  return Math.max(floor - elapsedMs, 0);
}

/** Length of the fade-out itself; instant when motion is reduced. */
export function fadeDuration(reducedMotion = false): number {
  return reducedMotion ? 0 : EXIT_MS;
}

/**
 * Whether the splash must lift now regardless of readiness.
 *
 * The safety net: no combination of slow fetches, thrown actions or missed
 * state updates may leave the overlay in place past this point.
 */
export function mustBail(elapsedMs: number): boolean {
  return elapsedMs >= MAX_MS;
}
