import { describe, it, expect } from 'vitest';
import { vendorSummary, type VendorEntry } from '@/lib/vendor-summary';
import { shareWithin, type ProductTotals } from '@/lib/products';

const entry = (id: string, date: string, amount: number, paid = true, splitFromId: string | null = null): VendorEntry =>
  ({ id, date, amount, paid, splitFromId });

describe('vendorSummary', () => {
  const today = '2026-11-06';

  it('adds up the month and the year', () => {
    const s = vendorSummary([entry('a', '2026-11-01', 10), entry('b', '2026-03-01', 20), entry('c', '2025-12-31', 40)], today);
    expect(s.month).toBe(10);
    expect(s.year).toBe(30);
    expect(s.total).toBe(70);
  });

  it('counts a split invoice once, with all its money', () => {
    const s = vendorSummary([entry('a', '2026-11-01', 60), entry('b', '2026-11-01', 40, false, 'a')], today);
    expect(s.invoices).toBe(1);
    expect(s.average).toBe(100);
  });

  it('follows the original for what is still to pay', () => {
    const paid = vendorSummary([entry('a', '2026-11-01', 60, true), entry('b', '2026-11-01', 40, false, 'a')], today);
    expect(paid.unpaid).toBe(0);
    const open = vendorSummary([entry('a', '2026-11-01', 60, false), entry('b', '2026-11-01', 40, false, 'a')], today);
    expect(open.unpaid).toBe(100);
  });

  it('knows the last purchase, and copes with none', () => {
    expect(vendorSummary([entry('a', '2026-01-01', 1), entry('b', '2026-05-01', 1)], today).lastPurchase).toBe('2026-05-01');
    expect(vendorSummary([], today)).toMatchObject({ invoices: 0, average: 0, lastPurchase: null });
  });
});

describe('shareWithin', () => {
  const product = (id: string, familia: string | null, revenue: number): ProductTotals =>
    ({ id, code: id, name: id, familia, subFamily: null, quantity: 1, revenue, share: 5 });
  const all = [product('a', 'Bebidas', 30), product('b', 'Bebidas', 10), product('c', 'Comida', 60), product('d', 'Bebidas', 0)];

  it('makes a family add up to 100%', () => {
    const shares = shareWithin(all, 'Bebidas').filter((p) => p.familia === 'Bebidas').map((p) => p.share);
    expect(shares).toEqual([75, 25, 0]);
  });

  it('leaves the shares of the whole alone with no family chosen', () => {
    expect(shareWithin(all, '')).toBe(all);
  });

  it('has nothing to say about a family that sold nothing', () => {
    expect(shareWithin([product('a', 'Bebidas', 0)], 'Bebidas')[0].share).toBeNull();
  });
});
