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

/**
 * Admin mutations touch clients' books, so the safeguards there are asserted
 * separately. Structural checks, but each failure is invisible in the UI.
 */
const adminSource = readFileSync('app/admin/actions.ts', 'utf8');

describe('admin entry mutations', () => {
  it('soft deletes rather than destroying a client record', () => {
    expect(adminSource).not.toMatch(/prisma\.dailySummary\.delete\(/);
    expect(adminSource).not.toMatch(/prisma\.costEntry\.delete\(/);
    expect(adminSource).toContain('deletedAt: new Date()');
  });

  it('validates what an admin writes, like an owner edit is validated', () => {
    // This was the one path that could write a negative revenue.
    expect(adminSource).toContain('adminRevenueUpdateSchema');
    expect(adminSource).toContain('adminCostUpdateSchema');
    expect(adminSource).not.toMatch(/adminUpdateEntry\([^)]*Record<string, any>/);
  });

  it('writes an audit entry for every edit and delete', () => {
    for (const action of [
      'admin.revenue.update',
      'admin.cost.update',
      'admin.revenue.delete',
      'admin.cost.delete',
    ]) {
      expect(adminSource).toContain(action);
    }
  });

  it('records which restaurant was touched', () => {
    // An audit entry with no tenant is not much of an audit entry.
    const audits = adminSource.match(/action: 'admin\.(revenue|cost)\./g) ?? [];
    const scoped = adminSource.match(/restaurantId: before\.restaurantId/g) ?? [];
    expect(scoped.length).toBe(audits.length);
  });
});
