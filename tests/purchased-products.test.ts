import { describe, it, expect } from 'vitest';
import { summarizePurchases, productDetail, type PurchaseLine } from '@/lib/purchased-products';

let n = 0;
const line = (over: Partial<PurchaseLine>): PurchaseLine => ({
  id: `l${n++}`,
  normalizedName: 'vinho tinto cadão 0.75l',
  productName: 'Vinho Tinto Cadão 0.75L',
  unit: 'un',
  quantity: 12,
  unitPrice: 2.51,
  total: 30.12,
  date: '2026-04-07',
  invoiceNumber: 'FT 1',
  vendorId: 'v1',
  vendorName: 'Comércio de Bebidas',
  ...over,
});

describe('summarizePurchases', () => {
  it('groups one product across suppliers, biggest spend first', () => {
    const rows = summarizePurchases([
      line({ total: 100, vendorId: 'v1', vendorName: 'A' }),
      line({ total: 50, vendorId: 'v2', vendorName: 'B', date: '2026-06-01', unitPrice: 2.61 }),
      line({ normalizedName: 'azeite', productName: 'Azeite', total: 400 }),
    ]);
    expect(rows.map((r) => r.normalizedName)).toEqual(['azeite', 'vinho tinto cadão 0.75l']);
    const wine = rows[1];
    expect(wine.spend).toBe(150);
    expect(wine.purchases).toBe(2);
    expect(wine.suppliers).toEqual(['A', 'B']);
    expect(wine.lastUnitPrice).toBe(2.61);
    expect(wine.lastDate).toBe('2026-06-01');
  });
});

describe('productDetail', () => {
  it('gives the price range and the price over time, oldest first', () => {
    const d = productDetail([
      line({ date: '2026-06-01', unitPrice: 2.61, total: 10, vendorName: 'B', vendorId: 'v2' }),
      line({ date: '2026-04-07', unitPrice: 2.51 }),
      line({ date: '2026-05-02', unitPrice: 0, total: 0 }), // an offer: no price paid
    ])!;
    expect(d.minPrice).toBe(2.51);
    expect(d.maxPrice).toBe(2.61);
    expect(d.points.map((p) => p.date)).toEqual(['2026-04-07', '2026-06-01']);
    expect(d.history.map((h) => h.date)).toEqual(['2026-06-01', '2026-05-02', '2026-04-07']);
    expect(d.suppliers.map((s) => s.vendorName)).toEqual(['Comércio de Bebidas', 'B']);
  });

  it('keeps other units out of the range and says how many', () => {
    const d = productDetail([
      line({ unit: 'un', unitPrice: 2.5, total: 300 }),
      line({ unit: 'cx', unitPrice: 15, total: 15 }),
    ])!;
    expect(d.unit).toBe('un');
    expect(d.maxPrice).toBe(2.5);
    expect(d.otherUnitPurchases).toBe(1);
    expect(d.spend).toBe(315);
  });

  it('puts undated purchases last and leaves them off the chart', () => {
    const d = productDetail([line({ date: null }), line({ date: '2026-01-01' })])!;
    expect(d.history[1].date).toBeNull();
    expect(d.points).toHaveLength(1);
  });

  it('returns null for nothing', () => {
    expect(productDetail([])).toBeNull();
  });
});
