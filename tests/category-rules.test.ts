import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards the rules that make category management safe.
 *
 * These are structural assertions rather than integration tests: the actions
 * need a database. What matters is that the safeguards are not quietly
 * removed, because each failure here is silent in the UI.
 */
const source = readFileSync('app/dashboard/category-actions.ts', 'utf8');

describe('category actions', () => {
  it('never hard deletes a category', () => {
    // Cost entries reference categories; deleting one would rewrite history.
    expect(source).not.toMatch(/category\.delete\b/);
    expect(source).not.toContain('deleteMany');
    expect(source).toContain('isActive: false');
  });

  it('scopes every lookup to the caller restaurant', () => {
    // A forged id from another restaurant must not resolve.
    const scoped = source.match(/restaurantId: owner\.restaurantId/g) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(5);
  });

  it('requires an owner for every mutation', () => {
    const exported = source.match(/export async function/g) ?? [];
    const guards = source.match(/await requireOwner\(\)/g) ?? [];
    expect(guards.length).toBe(exported.length);
  });

  it('refuses to flag a goods category as labour', () => {
    // Prime Cost is COGS plus labour: flagging goods would double-count it.
    expect(source).toContain("type === 'OPEX' ? parsed.data.isLabour ?? false : false");
    expect(source).toContain("category.type !== 'OPEX' && isLabour");
  });

  it('reactivates instead of duplicating a retired name', () => {
    expect(source).toContain('isActive: true, isLabour');
  });

  it('rejects a duplicate name within the same type', () => {
    const checks = source.match(/mode: 'insensitive'/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(2);
  });
});
