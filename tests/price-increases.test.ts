import { describe, it, expect } from 'vitest';
import { cheapestToDate, priceIncreases, type Purchase } from '@/lib/price-increases';

const purchase = (date: string | null, unitPrice: number, over: Partial<Purchase> = {}): Purchase => ({
  productName: 'NATA',
  normalizedName: 'nata',
  vendorId: 'v1',
  vendorName: 'Makro',
  unit: 'kg',
  unitPrice,
  date,
  ...over,
});

describe('priceIncreases', () => {
  it('shows even a rise of half a percent', () => {
    const [rise] = priceIncreases([purchase('2026-01-01', 10), purchase('2026-02-01', 10.05)]);
    expect(rise.changePercent).toBe(0.5);
    expect(rise.previousPrice).toBe(10);
    expect(rise.newPrice).toBe(10.05);
  });

  it('ignores the wobble of a price worked out from a weight', () => {
    expect(priceIncreases([purchase('2026-01-01', 3.69), purchase('2026-02-01', 3.6906)])).toEqual([]);
  });

  it('leaves out what only ever fell', () => {
    expect(priceIncreases([purchase('2026-01-01', 10), purchase('2026-02-01', 8)])).toEqual([]);
  });

  it('keeps a product that rose once, even if it has since fallen', () => {
    const rises = priceIncreases([purchase('2024-01-01', 10), purchase('2024-02-01', 12), purchase('2026-01-01', 9)]);
    expect(rises).toHaveLength(1);
    expect(rises[0].date).toBe('2024-02-01');
    expect(rises[0].sinceFirstPercent).toBe(-10);
  });

  it('looks at the whole history, not the last months', () => {
    expect(priceIncreases([purchase('2019-01-01', 1), purchase('2019-02-01', 2)])).toHaveLength(1);
  });

  it('counts every rise and reports the latest', () => {
    const [rise] = priceIncreases([purchase('2026-01-01', 10), purchase('2026-02-01', 11), purchase('2026-03-01', 12.1)]);
    expect(rise.rises).toBe(2);
    expect(rise.previousPrice).toBe(11);
    expect(rise.sinceFirstPercent).toBe(21);
  });

  it('does not compare a kilo with a box, or one supplier with another', () => {
    expect(priceIncreases([purchase('2026-01-01', 10), purchase('2026-02-01', 40, { unit: 'cx' })])).toEqual([]);
    expect(priceIncreases([purchase('2026-01-01', 10), purchase('2026-02-01', 40, { vendorId: 'v2' })])).toEqual([]);
  });

  it('reads the way suppliers spell a unit as the same unit', () => {
    expect(priceIncreases([purchase('2026-01-01', 1, { unit: 'Uni' }), purchase('2026-02-01', 2, { unit: 'un' })])).toHaveLength(1);
  });

  it('puts the biggest rise first, and skips what has no date', () => {
    const rises = priceIncreases([
      purchase('2026-01-01', 10), purchase('2026-02-01', 11),
      purchase('2026-01-01', 10, { normalizedName: 'leite' }), purchase('2026-02-01', 15, { normalizedName: 'leite' }),
      purchase(null, 99, { normalizedName: 'leite' }),
    ]);
    expect(rises.map((r) => r.normalizedName)).toEqual(['leite', 'nata']);
  });
});

describe('cheapestToDate', () => {
  it('goes by what each supplier charges now, not what they once charged', () => {
    const best = cheapestToDate([
      purchase('2024-01-01', 5, { vendorId: 'a', vendorName: 'Antigo' }),
      purchase('2026-01-01', 12, { vendorId: 'a', vendorName: 'Antigo' }),
      purchase('2026-02-01', 10, { vendorId: 'b', vendorName: 'Novo' }),
      purchase('2026-03-01', 11, { vendorId: 'c', vendorName: 'Caro' }),
    ], 'kg');
    expect(best?.vendorName).toBe('Novo');
    expect(best?.suppliers).toBe(3);
    expect(best?.saving).toBe(1);
  });

  it('says so with one supplier', () => {
    const best = cheapestToDate([purchase('2026-01-01', 12)], 'kg');
    expect(best?.suppliers).toBe(1);
    expect(best?.saving).toBe(0);
  });

  it('compares only the same unit', () => {
    const best = cheapestToDate([purchase('2026-01-01', 12), purchase('2026-02-01', 1, { unit: 'un', vendorId: 'b' })], 'kg');
    expect(best?.unitPrice).toBe(12);
  });

  it('has nothing to say with no dated purchase', () => {
    expect(cheapestToDate([purchase(null, 12)], 'kg')).toBeNull();
  });
});
