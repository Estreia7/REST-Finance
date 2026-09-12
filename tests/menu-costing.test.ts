import { describe, it, expect } from 'vitest';
import {
  unitFactor,
  effectiveUnitCost,
  costLine,
  costMenuItem,
  netFromGross,
  suggestedPrice,
  classify,
} from '@/lib/menu-costing';

const cod = { unit: 'kg', manualUnitCost: null, invoiceUnitCost: 12.5, wastePercent: 0 };

describe('netFromGross', () => {
  it('divides rather than subtracting', () => {
    // 12.50 at 13% is 11.06, not 10.88. Subtracting 13% of the gross is the
    // commonest error in a hand-built menu spreadsheet, and it flatters every
    // margin on the page.
    expect(netFromGross(12.5, 13)).toBeCloseTo(11.0619, 3);
    expect(netFromGross(12.5, 13)).not.toBeCloseTo(12.5 * 0.87, 3);
  });

  it('handles the alcohol rate', () => {
    expect(netFromGross(6.15, 23)).toBeCloseTo(5.0, 2);
  });

  it('is identity at zero', () => {
    expect(netFromGross(10, 0)).toBe(10);
  });

  it('round-trips', () => {
    const net = netFromGross(24.6, 23);
    expect(net * 1.23).toBeCloseTo(24.6, 6);
  });
});

describe('unitFactor', () => {
  it('converts grams to kilos and millilitres to litres', () => {
    expect(unitFactor('g', 'kg')).toBe(0.001);
    expect(unitFactor('ml', 'L')).toBe(0.001);
  });

  it('is 1 for matching units', () => {
    expect(unitFactor('kg', 'kg')).toBe(1);
    expect(unitFactor('un', 'un')).toBe(1);
  });

  it('refuses nonsense rather than guessing', () => {
    // Grams of something bought by the unit is a mistake in the recipe.
    // Treating it as 1 would put a plausible wrong number on screen.
    expect(unitFactor('g', 'un')).toBeNull();
    expect(unitFactor('ml', 'kg')).toBeNull();
    expect(unitFactor('un', 'kg')).toBeNull();
  });
});

describe('effectiveUnitCost', () => {
  it('prefers the pinned price over the invoice', () => {
    const result = effectiveUnitCost({ ...cod, manualUnitCost: 14 });
    expect(result).toEqual({ cost: 14, source: 'manual' });
  });

  it('falls back to the invoice', () => {
    expect(effectiveUnitCost(cod)).toEqual({ cost: 12.5, source: 'invoice' });
  });

  it('reports having no price at all', () => {
    expect(effectiveUnitCost({ ...cod, invoiceUnitCost: null })).toEqual({
      cost: null,
      source: 'none',
    });
  });
});

describe('costLine', () => {
  it('costs a straightforward line', () => {
    const line = costLine({
      ingredientId: 'i1', name: 'Bacalhau', quantity: 150, unit: 'g', ingredient: cod,
    });
    expect(line.cost).toBeCloseTo(1.875, 4);
    expect(line.source).toBe('invoice');
    expect(line.problem).toBeNull();
  });

  it('inflates the quantity for waste rather than the cost', () => {
    // 1kg of whole fish yielding 800g plated means 150g on the plate consumed
    // 187.5g of purchase — not 150g plus 20% of its cost.
    const line = costLine({
      ingredientId: 'i1', name: 'Bacalhau', quantity: 150, unit: 'g',
      ingredient: { ...cod, wastePercent: 20 },
    });
    expect(line.cost).toBeCloseTo(2.34375, 4);
    // The naive version would give 1.875 * 1.2 = 2.25, which is lower.
    expect(line.cost!).toBeGreaterThan(1.875 * 1.2);
  });

  it('flags a line it cannot convert', () => {
    const line = costLine({
      ingredientId: 'i1', name: 'Ovos', quantity: 50, unit: 'g',
      ingredient: { unit: 'un', manualUnitCost: 0.25, invoiceUnitCost: null, wastePercent: 0 },
    });
    expect(line.cost).toBeNull();
    expect(line.problem).toBe('bad-unit');
  });

  it('flags a line with no price', () => {
    const line = costLine({
      ingredientId: 'i1', name: 'Sal', quantity: 5, unit: 'g',
      ingredient: { unit: 'kg', manualUnitCost: null, invoiceUnitCost: null, wastePercent: 0 },
    });
    expect(line.problem).toBe('no-price');
  });

  it('clamps absurd waste instead of dividing by zero', () => {
    const line = costLine({
      ingredientId: 'i1', name: 'X', quantity: 100, unit: 'g',
      ingredient: { ...cod, wastePercent: 100 },
    });
    expect(Number.isFinite(line.cost!)).toBe(true);
  });
});

describe('costMenuItem', () => {
  const dish = {
    priceGross: 12.5,
    vatRate: 13,
    lines: [
      { ingredientId: 'a', name: 'Bacalhau', quantity: 150, unit: 'g', ingredient: cod },
      {
        ingredientId: 'b', name: 'Batata', quantity: 200, unit: 'g',
        ingredient: { unit: 'kg', manualUnitCost: 1.2, invoiceUnitCost: null, wastePercent: 0 },
      },
      {
        ingredientId: 'c', name: 'Ovos', quantity: 2, unit: 'un',
        ingredient: { unit: 'un', manualUnitCost: 0.25, invoiceUnitCost: null, wastePercent: 0 },
      },
    ],
  };

  it('computes the plate against the net price, not the gross', () => {
    const result = costMenuItem(dish);
    expect(result.priceNet).toBeCloseTo(11.0619, 3);
    expect(result.foodCost).toBeCloseTo(1.875 + 0.24 + 0.5, 4);
    expect(result.grossProfit).toBeCloseTo(11.0619 - 2.615, 3);
  });

  it('reports food cost against net, which is the number a chef manages to', () => {
    const result = costMenuItem(dish);
    expect(result.foodCostPercent).toBeCloseTo((2.615 / 11.0619) * 100, 2);
    // Against the gross it would read 20.9%, flattering the dish.
    expect(result.foodCostPercent!).toBeGreaterThan((2.615 / 12.5) * 100);
  });

  it('says when a total understates reality', () => {
    const result = costMenuItem({
      ...dish,
      lines: [
        ...dish.lines,
        {
          ingredientId: 'd', name: 'Azeite', quantity: 20, unit: 'ml',
          ingredient: { unit: 'L', manualUnitCost: null, invoiceUnitCost: null, wastePercent: 0 },
        },
      ],
    });
    expect(result.incomplete).toBe(true);
    expect(result.missingCount).toBe(1);
  });

  it('does not claim a 0% food cost for a free item', () => {
    const result = costMenuItem({ ...dish, priceGross: 0 });
    expect(result.foodCostPercent).toBeNull();
    expect(result.marginPercent).toBeNull();
  });

  it('handles a dish sold below its cost', () => {
    const result = costMenuItem({ ...dish, priceGross: 2 });
    expect(result.grossProfit).toBeLessThan(0);
    expect(result.marginPercent!).toBeLessThan(0);
  });
});

describe('suggestedPrice', () => {
  it('returns a gross price, because that is what goes on the board', () => {
    // 2.615 at a 30% target is 8.717 net, 9.85 gross at 13%.
    const price = suggestedPrice(2.615, 30, 13);
    expect(price).toBeCloseTo(9.85, 2);
  });

  it('refuses an impossible target', () => {
    expect(suggestedPrice(3, 0, 13)).toBeNull();
  });
});

describe('classify', () => {
  it('places each dish in its box', () => {
    expect(classify(8, 100, 5, 50)).toBe('star');
    expect(classify(3, 100, 5, 50)).toBe('plowhorse');
    expect(classify(8, 10, 5, 50)).toBe('puzzle');
    expect(classify(3, 10, 5, 50)).toBe('dog');
  });

  it('treats a dish exactly at both averages as a star', () => {
    // The boundary has to fall somewhere; the generous side avoids telling an
    // owner to drop a perfectly average dish.
    expect(classify(5, 50, 5, 50)).toBe('star');
  });
});
