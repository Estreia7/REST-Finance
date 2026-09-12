import { cookies } from 'next/headers';

/**
 * Which restaurant the current request is about.
 *
 * An owner may have several. The choice is kept in a cookie rather than the
 * session, because the JWT is only reissued periodically and switching has to
 * take effect on the very next request.
 *
 * The cookie is a hint, never an authorisation. Everything that reads it
 * validates the id against the caller's own memberships first and silently
 * falls back to their default restaurant, so a forged or stale cookie can only
 * ever select something the person already has access to.
 */

export const ACTIVE_RESTAURANT_COOKIE = 'rf_restaurant';

/** The id the browser is asking for, unvalidated. */
export function readActiveRestaurantCookie(): string | null {
  const value = cookies().get(ACTIVE_RESTAURANT_COOKIE)?.value?.trim();
  return value ? value : null;
}

/**
 * Picks the restaurant to act on.
 *
 * `memberships` is already scoped to the caller, so anything in it is by
 * definition permitted. A requested id that is not in the list is discarded
 * rather than rejected: an owner who lost access to one restaurant should land
 * on another, not on an error page.
 */
export function resolveActiveRestaurant<T extends { restaurantId: string }>(
  memberships: T[],
  requestedId: string | null
): T | null {
  if (memberships.length === 0) return null;
  if (requestedId) {
    const match = memberships.find((m) => m.restaurantId === requestedId);
    if (match) return match;
  }
  return memberships[0];
}
