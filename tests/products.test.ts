import { describe, it, expect } from 'vitest';
import {
  isModifierFamilia,
  isNonSalesFamilia,
  isCatchAll,
  totalsByProduct,
  rankModifiers,
  monthlySeries,
  extremes,
  type SaleRow,
} from '@/lib/products';

function sale(over: Partial<SaleRow> = {}): SaleRow {
  return {
    productId: 'p1',
    code: '9',
    name: 'SMASHIE SIMPLES',
    familia: 'COMIDAS',
    subFamily: 'SMASHIES',
    monthIndex: 0,
    quantity: 1,
    revenue: 10,
    ...over,
  };
}

describe('telling products apart from kitchen-display modifiers', () => {
  it('knows the modifier families the till uses', () => {
    expect(isModifierFamilia('INGREDIENTES')).toBe(true);
    expect(isModifierFamilia('MOLHOS')).toBe(true);
    expect(isModifierFamilia('ingredientes')).toBe(true);
    expect(isModifierFamilia('  EXTRAS  ')).toBe(true);
  });

  it('treats an unknown family as products, not as modifiers', () => {
    // The safe default: a new family appears in the products table where the
    // owner sees it, rather than disappearing into a ranking.
    expect(isModifierFamilia('COMIDAS')).toBe(false);
    expect(isModifierFamilia('SOBREMESAS GELADAS')).toBe(false);
    expect(isModifierFamilia(null)).toBe(false);
    expect(isModifierFamilia('')).toBe(false);
  });
});

describe('totals per product', () => {
  it('adds a product across days and months', () => {
    const totals = totalsByProduct([
      sale({ monthIndex: 0, quantity: 4, revenue: 40 }),
      sale({ monthIndex: 1, quantity: 6, revenue: 60 }),
    ]);
    expect(totals).toHaveLength(1);
    expect(totals[0].quantity).toBe(10);
    expect(totals[0].revenue).toBe(100);
  });

  it('orders by takings, biggest first', () => {
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'A', revenue: 10 }),
      sale({ productId: 'b', name: 'B', revenue: 90 }),
      sale({ productId: 'c', name: 'C', revenue: 50 }),
    ]);
    expect(totals.map((p) => p.name)).toEqual(['B', 'C', 'A']);
  });

  it('gives each product its share of the takings', () => {
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'A', revenue: 75 }),
      sale({ productId: 'b', name: 'B', revenue: 25 }),
    ]);
    expect(totals[0].share).toBe(75);
    expect(totals[1].share).toBe(25);
  });

  it('keeps shares against the whole period when a family is filtered', () => {
    // Otherwise picking BEBIDAS would show a 4 EUR coffee as 40% of the
    // business, which is a number the owner would act on.
    const totals = totalsByProduct([sale({ productId: 'a', name: 'CAFE', revenue: 40 })], 1000);
    expect(totals[0].share).toBe(4);
  });

  it('reports no share rather than zero when nothing sold', () => {
    const totals = totalsByProduct([sale({ quantity: 0, revenue: 0 })]);
    expect(totals[0].share).toBeNull();
  });

  it('orders zero-priced rows by units, not arbitrarily', () => {
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'ALFACE', revenue: 0, quantity: 3 }),
      sale({ productId: 'b', name: 'CEBOLA', revenue: 0, quantity: 9 }),
    ]);
    expect(totals.map((p) => p.name)).toEqual(['CEBOLA', 'ALFACE']);
  });
});

describe('the ingredients ranking', () => {
  const ROWS = [
    sale({ productId: 'i1', name: 'CEBOLA CARAMELIZADA', familia: 'INGREDIENTES', subFamily: null, quantity: 40, revenue: 0 }),
    sale({ productId: 'i2', name: 'BACON', familia: 'INGREDIENTES', subFamily: null, quantity: 95, revenue: 0 }),
    sale({ productId: 'm1', name: 'MAIONESE', familia: 'MOLHOS', subFamily: null, quantity: 60, revenue: 0 }),
    sale({ productId: 'p1', name: 'SMASHIE', familia: 'COMIDAS', quantity: 500, revenue: 5000 }),
  ];

  it('ranks by how often each was asked for', () => {
    const top = rankModifiers(ROWS);
    expect(top.map((p) => p.name)).toEqual(['BACON', 'MAIONESE', 'CEBOLA CARAMELIZADA']);
  });

  it('leaves real products out of it', () => {
    // SMASHIE sells 500 units — it would top any ranking that let it in,
    // and it is not an ingredient.
    const top = rankModifiers(ROWS);
    expect(top.map((p) => p.name)).not.toContain('SMASHIE');
  });

  it('ranks the zero-priced rows that a money sort would bury', () => {
    // Every modifier rings at nothing. This is the whole reason the ranking
    // is on units.
    const top = rankModifiers(ROWS);
    expect(top.every((p) => p.revenue === 0)).toBe(true);
    expect(top[0].quantity).toBe(95);
  });

  it('cuts the list to the limit asked for', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      sale({ productId: `i${i}`, name: `ING ${i}`, familia: 'INGREDIENTES', quantity: i + 1, revenue: 0 }),
    );
    expect(rankModifiers(many, 10)).toHaveLength(10);
    // The ten most asked for, not the first ten.
    expect(rankModifiers(many, 10)[0].quantity).toBe(25);
  });
});

describe('one product over the year', () => {
  it('gives all twelve months, zero where nothing sold', () => {
    // A product that stopped in March should fall to nothing, not end.
    const series = monthlySeries([
      sale({ monthIndex: 0, quantity: 10, revenue: 100 }),
      sale({ monthIndex: 2, quantity: 4, revenue: 40 }),
    ]);
    expect(series).toHaveLength(12);
    expect(series[0].quantity).toBe(10);
    expect(series[1].quantity).toBe(0);
    expect(series[2].quantity).toBe(4);
    expect(series[11].quantity).toBe(0);
  });

  it('adds several days inside the same month', () => {
    const series = monthlySeries([
      sale({ monthIndex: 5, quantity: 3, revenue: 30 }),
      sale({ monthIndex: 5, quantity: 7, revenue: 70 }),
    ]);
    expect(series[5].quantity).toBe(10);
    expect(series[5].revenue).toBe(100);
  });
});

describe('the best and worst seller', () => {
  it('names the most and least sold by units', () => {
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'TOP', quantity: 500, revenue: 100 }),
      sale({ productId: 'b', name: 'MID', quantity: 50, revenue: 900 }),
      sale({ productId: 'c', name: 'LOW', quantity: 2, revenue: 80 }),
    ]);
    const { best, worst } = extremes(totals);
    // By units, so the 900 EUR MID is neither — which is the question the
    // owner asked: what sells, not what is expensive.
    expect(best!.name).toBe('TOP');
    expect(worst!.name).toBe('LOW');
  });

  it('ignores products that sold nothing at all', () => {
    // A discontinued dish is not the worst performer; it is not on the menu.
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'SELLS', quantity: 10, revenue: 100 }),
      sale({ productId: 'b', name: 'GONE', quantity: 0, revenue: 0 }),
    ]);
    const { worst } = extremes(totals);
    expect(worst!.name).toBe('SELLS');
  });

  it('names nothing when nothing sold', () => {
    const { best, worst } = extremes(totalsByProduct([sale({ quantity: 0, revenue: 0 })]));
    expect(best).toBeNull();
    expect(worst).toBeNull();
  });

  it('names the same product as both when only one sold', () => {
    const totals = totalsByProduct([sale({ quantity: 5, revenue: 50 })]);
    const { best, worst } = extremes(totals);
    expect(best!.id).toBe(worst!.id);
  });
});

/**
 * These three came out of running the parser over a real client export
 * (8 861 product rows, 181 products, one trading year). Each was wrong in a
 * way only real data shows.
 */
describe('what the real export turned up', () => {
  it('drops the catch-all line the till books for unspecified toppings', () => {
    // 2 877 of these in one year — more than any real ingredient, so it
    // topped the ranking with the word "ingredients".
    expect(isCatchAll('INGREDIENTES', 'INGREDIENTES')).toBe(true);
    expect(isCatchAll('ingredientes', 'INGREDIENTES')).toBe(true);
    // A real ingredient is never named after its own family.
    expect(isCatchAll('BACON', 'INGREDIENTES')).toBe(false);
    expect(isCatchAll('MOLHO BBQ', 'MOLHOS')).toBe(false);
  });

  it('keeps the catch-all out of the ingredients ranking', () => {
    const top = rankModifiers([
      sale({ productId: 'c', name: 'INGREDIENTES', familia: 'INGREDIENTES', quantity: 2877, revenue: 0 }),
      sale({ productId: 'b', name: 'BACON', familia: 'INGREDIENTES', quantity: 2514, revenue: 0 }),
      sale({ productId: 'o', name: 'CEBOLA CARAMELIZADA', familia: 'INGREDIENTES', quantity: 2254, revenue: 0 }),
    ]);
    expect(top.map((p) => p.name)).toEqual(['BACON', 'CEBOLA CARAMELIZADA']);
  });

  it('knows staff meals are not sales', () => {
    // Rung through at zero so the stock comes off. A cost, not a sale, so a
    // staff burger must not appear among the best sellers at nought euros.
    expect(isNonSalesFamilia('STAFF')).toBe(true);
    expect(isNonSalesFamilia('staff')).toBe(true);
    expect(isNonSalesFamilia('OFERTAS')).toBe(true);
    expect(isNonSalesFamilia('COMIDAS')).toBe(false);
    expect(isNonSalesFamilia(null)).toBe(false);
  });

  it('still counts a discontinued family, which did sell', () => {
    // DESCONTINUADOS carries 3 045 EUR of real takings from items since
    // taken off the menu. Hiding it would lose revenue that happened.
    expect(isNonSalesFamilia('DESCONTINUADOS')).toBe(false);
    expect(isModifierFamilia('DESCONTINUADOS')).toBe(false);
  });
});

describe('what the till includes rather than sells', () => {
  it('does not call an included side the best seller', () => {
    // Straight from real data: 2 270 small chips at six cents each, because
    // every menu comes with one and the till rings it so the kitchen sees
    // it. The real best seller is the burger a line below.
    const totals = totalsByProduct([
      sale({ productId: 'chips', name: 'BATATA FRITA NORMAL PEQ.', quantity: 2270, revenue: 134 }),
      sale({ productId: 'burger', name: 'SMASHIE SIMPLES C/QUEIJO', quantity: 1380, revenue: 12157.04 }),
    ]);
    const { best } = extremes(totals);
    expect(best!.name).toBe('SMASHIE SIMPLES C/QUEIJO');
  });

  it('keeps the cheapest thing a customer actually buys', () => {
    // An espresso at a euro is a real sale and may well be the best seller.
    const totals = totalsByProduct([
      sale({ productId: 'esp', name: 'ESPRESSO', quantity: 824, revenue: 820.7 }),
      sale({ productId: 'b', name: 'SMASHIE', quantity: 100, revenue: 900 }),
    ]);
    expect(extremes(totals).best!.name).toBe('ESPRESSO');
  });

  it('leaves an included item out of the slowest seller too', () => {
    // Otherwise a single token-priced row becomes "your slowest dish", which
    // sends the owner to look at something that is not on the menu at all.
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'SELLS LOTS', quantity: 500, revenue: 2500 }),
      sale({ productId: 'b', name: 'SELLS FEW', quantity: 9, revenue: 90 }),
      sale({ productId: 'c', name: 'TOKEN SIDE', quantity: 3, revenue: 0.15 }),
    ]);
    const { worst } = extremes(totals);
    expect(worst!.name).toBe('SELLS FEW');
  });

  it('names nothing when every row is an included one', () => {
    const totals = totalsByProduct([
      sale({ productId: 'a', name: 'TOKEN', quantity: 50, revenue: 0 }),
    ]);
    expect(extremes(totals).best).toBeNull();
  });

  it('still shows included items in the table', () => {
    // They are real rows with real quantities; only the best/worst callout
    // excludes them, because that is the claim that would be wrong.
    const totals = totalsByProduct([
      sale({ productId: 'chips', name: 'BATATA FRITA NORMAL PEQ.', quantity: 2270, revenue: 134 }),
    ]);
    expect(totals).toHaveLength(1);
    expect(totals[0].quantity).toBe(2270);
  });
});

describe('the two lists of families nobody sells from', () => {
  /**
   * There are two, they look alike, and merging them would break something.
   *
   * isNonSalesFamilia answers "is this revenue?" for the Produtos tab.
   * SKIP_FAMILIAS in catalogue-import answers "is this worth putting on the
   * menu I sell from today?". They differ by two names, in both directions,
   * and each difference is correct:
   *
   *   DESCONTINUADOS was real revenue and belongs in the Produtos history,
   *   but importing 52 dead dishes would be a menu nobody sells from.
   *
   *   OFERTAS is not revenue -- it was given away -- but it is not
   *   discontinued either, so it is still on the menu.
   *
   * This test exists so nobody tidies them into one.
   */
  it('keeps giveaways out of revenue', () => {
    expect(isNonSalesFamilia('OFERTAS')).toBe(true);
  });

  it('keeps discontinued products in the revenue history', () => {
    // They sold, for real money, and the owner may want to know what they
    // did before being dropped.
    expect(isNonSalesFamilia('DESCONTINUADOS')).toBe(false);
  });
});
