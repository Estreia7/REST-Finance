import { describe, it, expect } from 'vitest';
import { foldMonthlySeries, OTHER_SERIES } from '@/lib/monthly-series';

describe('foldMonthlySeries', () => {
  it('gives twelve months, largest category first', () => {
    const { series, data } = foldMonthlySeries(2026, [
      { monthIndex: 0, name: 'BEBIDAS', amount: 50 },
      { monthIndex: 0, name: 'COMIDAS', amount: 100 },
      { monthIndex: 2, name: 'COMIDAS', amount: 30 },
    ]);
    expect(series).toEqual(['COMIDAS', 'BEBIDAS']);
    expect(data).toHaveLength(12);
    expect(data[0]).toMatchObject({ month: '2026-01', COMIDAS: 100, BEBIDAS: 50 });
    expect(data[1]).toMatchObject({ COMIDAS: 0, BEBIDAS: 0 });
  });

  it('folds the tail into Outras so each month still adds up', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ monthIndex: 4, name: `C${i}`, amount: 100 - i }));
    const { series, data } = foldMonthlySeries(2026, rows);
    expect(series).toHaveLength(7);
    expect(series[6]).toBe(OTHER_SERIES);
    const may = data[4];
    const sum = series.reduce((s, k) => s + Number(may[k]), 0);
    expect(sum).toBe(rows.reduce((s, r) => s + r.amount, 0));
  });

  it('keeps six named categories at most', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ monthIndex: 0, name: `C${i}`, amount: 10 - i }));
    const { series } = foldMonthlySeries(2026, rows);
    expect(series).toEqual(['C0', 'C1', 'C2', 'C3', 'C4', 'C5', OTHER_SERIES]);
  });

  it('does not fold when there are six or fewer', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ monthIndex: 0, name: `C${i}`, amount: 10 - i }));
    expect(foldMonthlySeries(2026, rows).series).not.toContain(OTHER_SERIES);
  });

  it('leaves out categories that never moved', () => {
    const { series } = foldMonthlySeries(2026, [
      { monthIndex: 0, name: 'A', amount: 10 },
      { monthIndex: 0, name: 'ZERO', amount: 0 },
    ]);
    expect(series).toEqual(['A']);
  });
});
