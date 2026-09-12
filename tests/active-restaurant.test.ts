import { describe, it, expect } from 'vitest';
import { resolveActiveRestaurant } from '@/lib/active-restaurant';

/**
 * The cookie decides which restaurant the dashboard is about, so this function
 * is the boundary between a user preference and an authorisation decision.
 * It is only ever handed memberships already scoped to the caller, and these
 * tests pin down that it can never reach outside that list.
 */

const mine = [
  { restaurantId: 'rest-a', role: 'OWNER' },
  { restaurantId: 'rest-b', role: 'OWNER' },
];

describe('resolveActiveRestaurant', () => {
  it('honours a requested restaurant the person belongs to', () => {
    expect(resolveActiveRestaurant(mine, 'rest-b')?.restaurantId).toBe('rest-b');
  });

  it('falls back to the first membership when nothing is requested', () => {
    expect(resolveActiveRestaurant(mine, null)?.restaurantId).toBe('rest-a');
  });

  it('never selects a restaurant outside the membership list', () => {
    // A forged or copied cookie naming someone else's restaurant.
    const resolved = resolveActiveRestaurant(mine, 'rest-someone-else');

    expect(resolved?.restaurantId).toBe('rest-a');
    expect(resolved?.restaurantId).not.toBe('rest-someone-else');
  });

  it('falls back rather than failing when access was revoked', () => {
    // The cookie still names the restaurant they were removed from.
    const remaining = [{ restaurantId: 'rest-b', role: 'OWNER' }];

    expect(resolveActiveRestaurant(remaining, 'rest-a')?.restaurantId).toBe('rest-b');
  });

  it('returns nothing when the person holds no memberships at all', () => {
    expect(resolveActiveRestaurant([], 'rest-a')).toBeNull();
    expect(resolveActiveRestaurant([], null)).toBeNull();
  });

  it('is stable for a single-restaurant owner regardless of the cookie', () => {
    const one = [{ restaurantId: 'rest-only', role: 'OWNER' }];

    expect(resolveActiveRestaurant(one, null)?.restaurantId).toBe('rest-only');
    expect(resolveActiveRestaurant(one, 'rest-only')?.restaurantId).toBe('rest-only');
    expect(resolveActiveRestaurant(one, 'rest-other')?.restaurantId).toBe('rest-only');
  });
});
