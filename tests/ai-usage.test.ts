import { describe, it, expect } from 'vitest';
import { costUsd, modelLabel, isPriced } from '@/lib/ai-models';
import { summariseUsage, dayKey, periodStart, subjectOf, type UsageRow, type RestaurantInfo } from '@/lib/ai-usage';

describe('costUsd', () => {
  it('prices Haiku 5.5 at a tenth of Haiku 4.5', () => {
    // 4,000 tokens in and 1,000 out: a typical invoice.
    expect(costUsd('claude-haiku-4-5', 4000, 1000)).toBeCloseTo(0.009, 9);
    expect(costUsd('claude-haiku-5-5', 4000, 1000)).toBeCloseTo(0.0009, 9);
  });

  it('bills a long Haiku 5.5 prompt entirely at the higher rate', () => {
    expect(costUsd('claude-haiku-5-5', 100_000, 0)).toBeCloseTo(0.01, 9);
    // One token over the line moves the whole request, output included.
    expect(costUsd('claude-haiku-5-5', 100_001, 1_000_000)).toBeCloseTo(0.0500005 + 2.5, 6);
  });

  it('counts an unknown model as unpriced rather than throwing', () => {
    expect(costUsd('claude-something-new', 1000, 1000)).toBe(0);
    expect(isPriced('claude-something-new')).toBe(false);
    expect(modelLabel('claude-something-new')).toBe('claude-something-new');
    expect(modelLabel('claude-haiku-5-5')).toBe('Claude Haiku 5.5');
  });
});

const owner = (id: string) => ({ id, name: id.toUpperCase(), email: `${id}@x.pt` });

function row(partial: Partial<UsageRow>): UsageRow {
  return {
    restaurantId: null, userId: null, source: 'scan', model: 'claude-haiku-5-5',
    inputTokens: 1000, outputTokens: 100, costUsd: 0.01, durationMs: 2000,
    succeeded: true, stopReason: 'tool_use', createdAt: new Date('2026-10-08T10:00:00Z'),
    ...partial,
  };
}

describe('summariseUsage', () => {
  const now = new Date('2026-10-08T15:00:00Z');
  const restaurants: RestaurantInfo[] = [
    { id: 'r1', name: 'Tasca', owners: [owner('ana')] },
    { id: 'r2', name: 'Grill', owners: [owner('ana')] },
    { id: 'r3', name: 'Bar', owners: [owner('rui')] },
  ];

  it('ranks restaurants and rolls them up to their owner', () => {
    const rows = [
      row({ restaurantId: 'r1', costUsd: 0.03 }),
      row({ restaurantId: 'r2', costUsd: 0.02 }),
      row({ restaurantId: 'r3', costUsd: 0.04 }),
      row({ restaurantId: null, source: 'bench', costUsd: 0.01 }),
    ];
    const s = summariseUsage(rows, restaurants, '7d', now);

    expect(s.totals.costUsd).toBeCloseTo(0.1, 9);
    expect(s.restaurants.map((r) => r.id)).toEqual(['r3', 'r1', 'r2']);
    expect(s.restaurants[0].share).toBeCloseTo(0.4, 9);

    // Ana owns two restaurants whose spend together beats Rui's one.
    expect(s.owners.map((o) => o.owner.id)).toEqual(['ana', 'rui']);
    expect(s.owners[0].costUsd).toBeCloseTo(0.05, 9);
    expect(s.owners[0].restaurants.map((r) => r.id)).toEqual(['r1', 'r2']);

    // The bench is counted in the total but belongs to no restaurant.
    expect(s.bySource.find((b) => b.source === 'bench')?.costUsd).toBeCloseTo(0.01, 9);
  });

  it('counts failures and refusals, which are still billed', () => {
    const rows = [
      row({ restaurantId: 'r1' }),
      row({ restaurantId: 'r1', succeeded: false, stopReason: 'refusal' }),
      row({ restaurantId: 'r1', succeeded: false, stopReason: null, inputTokens: 0, outputTokens: 0, costUsd: 0 }),
    ];
    const s = summariseUsage(rows, restaurants, '7d', now);
    expect(s.totals.calls).toBe(3);
    expect(s.totals.failed).toBe(2);
    expect(s.totals.refused).toBe(1);
    expect(s.restaurants[0].failed).toBe(2);
  });

  it('keeps every day of the window on the chart, empty ones as zero', () => {
    const s = summariseUsage([row({ restaurantId: 'r1' })], restaurants, '7d', now);
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay.at(-1)).toEqual({ date: '2026-10-08', costUsd: 0.01, calls: 1 });
    expect(s.byDay[0].calls).toBe(0);
    expect(s.totals.projected30dUsd).toBeCloseTo((0.01 / 7) * 30, 9);
  });

  it('projects from the last week, so a cheaper model shows at once', () => {
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const rows = [
      // Three weeks on the dear model, then a week on the cheap one.
      ...Array.from({ length: 21 }, (_, i) => row({ costUsd: 0.1, createdAt: daysAgo(29 - i) })),
      ...Array.from({ length: 7 }, (_, i) => row({ costUsd: 0.01, createdAt: daysAgo(6 - i) })),
    ];
    const s = summariseUsage(rows, restaurants, '30d', now);
    expect(s.totals.projected30dUsd).toBeCloseTo(0.3, 9);
  });

  it('splits spend by model, so a model change is visible', () => {
    const rows = [
      row({ model: 'claude-haiku-4-5', costUsd: 0.009 }),
      row({ model: 'claude-haiku-5-5', costUsd: 0.001 }),
    ];
    const s = summariseUsage(rows, restaurants, 'all', now);
    expect(s.byModel.map((m) => m.label)).toEqual(['Claude Haiku 4.5', 'Claude Haiku 5.5']);
  });

  it('keeps a deleted restaurant under its id so the total still adds up', () => {
    const s = summariseUsage([row({ restaurantId: 'gone' })], restaurants, '7d', now);
    expect(s.restaurants[0]).toMatchObject({ id: 'gone', name: 'gone', owners: [] });
    expect(s.owners).toEqual([]);
  });

  it('returns an empty but well-formed summary when nothing was logged', () => {
    const s = summariseUsage([], restaurants, 'all', now);
    expect(s.totals.calls).toBe(0);
    expect(s.totals.meanCostUsd).toBeNull();
    expect(s.byDay).toEqual([]);
  });
});

describe('dayKey', () => {
  it('uses Lisbon days', () => {
    // 23:30 UTC on 7 October is 00:30 on the 8th in Lisbon (summer time).
    expect(dayKey(new Date('2026-10-07T23:30:00Z'))).toBe('2026-10-08');
  });
});

describe('periodStart', () => {
  it('has no start for all time', () => {
    expect(periodStart('all')).toBeNull();
  });
});

describe('subjectOf', () => {
  it('names an invoice by its supplier, number, date, lines and total', () => {
    expect(subjectOf({
      type: 'cost_receipt', date: '2026-10-08', vendor: ' Makro Portugal ', invoiceNumber: 'FT 2026/1234',
      items: [
        { product: 'A', quantity: 1, unitPrice: 1, total: 1 },
        { product: 'B', quantity: 1, unitPrice: 1, total: 1 },
      ],
      grandTotal: 101.8, suggestedType: 'COGS', suggestedCategory: 'Comida',
    })).toEqual({ kind: 'invoice', vendor: 'Makro Portugal', invoiceNumber: 'FT 2026/1234', date: '2026-10-08', total: 101.8, lines: 2 });
  });

  it('names a till report by its day and takings', () => {
    expect(subjectOf({
      type: 'daily_report', date: '2026-10-08', dineInRevenue: 1245.8, takeawayRevenue: 387.5, dineInTickets: 62, takeawayTickets: 23,
    })).toEqual({ kind: 'daily', date: '2026-10-08', total: 1633.3 });
  });

  it('keeps a missing number as missing rather than empty', () => {
    const s = subjectOf({
      type: 'cost_receipt', date: '', vendor: '', invoiceNumber: '  ', items: [], grandTotal: 5,
      suggestedType: 'OPEX', suggestedCategory: 'x',
    });
    expect(s).toMatchObject({ vendor: null, invoiceNumber: null, date: null, lines: 0 });
  });
});
