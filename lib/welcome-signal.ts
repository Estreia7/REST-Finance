'use client';

/**
 * The handshake that decides when the welcome splash runs.
 *
 * The splash belongs to the act of signing in, not to the dashboard: someone
 * refreshing their P&L at 2am should not be greeted again. So the sign-in
 * form raises a flag, and the destination page consumes it exactly once.
 *
 * `sessionStorage` rather than a cookie or query string: it is scoped to the
 * tab, dies with it, never reaches the server, and survives the client-side
 * navigation between the modal and the dashboard.
 */

const KEY = 'rf:welcome';

/** Called by the sign-in and registration forms, just before redirecting. */
export function markJustSignedIn(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Private browsing, or storage disabled. The splash is decorative, so
    // skipping it is the correct failure: the dashboard still loads.
  }
}

/**
 * Reads the flag and clears it in the same step, so a refresh of the
 * destination page does not replay the greeting.
 */
export function consumeJustSignedIn(): boolean {
  try {
    const found = sessionStorage.getItem(KEY) === '1';
    if (found) sessionStorage.removeItem(KEY);
    return found;
  } catch {
    return false;
  }
}
