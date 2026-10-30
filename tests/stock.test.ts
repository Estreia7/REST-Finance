import { describe, it, expect } from 'vitest';
import {
  averageUnitCost, suggestItems, essentialItemIds, estimatedOnHand, orderQuantity, usage, lineKey, type PurchaseLine,
} from '@/lib/stock';

const line = (over: Partial<PurchaseLine>): PurchaseLine => ({
  normalizedName: 'azeite', productName: 'Azeite', unit: 'L', quantity: 5, unitPrice: 6, total: 30,
  date: '2026-10-01', vendorId: 'v1', vendorName: 'Makro', ...over,
});

describe('averageUnitCost', () => {
  it('weights by quantity', () => {
    expect(averageUnitCost([line({ quantity: 5, total: 30 }), line({ quantity: 15, total: 105 })])).toBe(6.75);
    expect(averageUnitCost([])).toBeNull();
  });
});

describe('suggestItems', () => {
  it('ranks by spend, skips existing items, and picks the usual supplier', () => {
    const lines = [
      line({}), line({ vendorId: 'v2', vendorName: 'Recheio' }), line({ vendorId: 'v2', vendorName: 'Recheio' }),
      line({ normalizedName: 'bacalhau', productName: 'Bacalhau', unit: 'kg', total: 200 }),
      line({ normalizedName: 'sal', productName: 'Sal', unit: 'kg', total: 2 }),
    ];
    const s = suggestItems(lines, new Set([lineKey('sal', 'kg')]));
    expect(s.map((x) => x.name)).toEqual(['Bacalhau', 'Azeite']);
    expect(s[1]).toMatchObject({ spend: 90, purchases: 3, vendorName: 'Recheio' });
  });
});

describe('essentialItemIds', () => {
  it('keeps the items behind 80% of spend', () => {
    const ids = essentialItemIds(new Map([['a', 500], ['b', 300], ['c', 100], ['d', 60], ['e', 40]]));
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});

describe('on hand and orders', () => {
  it('adds what was bought since the last count', () => {
    expect(estimatedOnHand({ quantity: 3, date: '2026-10-01' }, 4.5)).toBe(7.5);
    expect(estimatedOnHand(null, 4)).toBeNull();
  });

  it('orders up to twice the minimum, only below it', () => {
    expect(orderQuantity(3, 10)).toBe(17);
    expect(orderQuantity(10, 10)).toBe(0);
    expect(orderQuantity(2, null)).toBe(0);
    expect(orderQuantity(null, 10)).toBe(0);
  });

  it('measures what was really used between counts', () => {
    expect(usage(10, 20, 8)).toBe(22);
    expect(usage(5, 0, 7)).toBe(-2);
  });
});
