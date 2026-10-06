import { describe, it, expect } from 'vitest';
import {
  classifyProduct,
  planCatalogue,
  averagePrice,
  isAlcohol,
  vatRateFor,
  guessPurchaseUnit,
  type CatalogueProduct,
} from '@/lib/catalogue-import';

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p1',
    code: '9',
    name: 'SMASHIE DUPLO C/QUEIJO',
    familia: 'COMIDAS',
    subFamily: 'SMASHIES',
    quantity: 100,
    revenue: 1000,
    ...over,
  };
}

describe('deciding what each till product becomes', () => {
  it('makes a dish of something the kitchen composes', () => {
    // A smashie duplo is meat, a bun and sauce — it needs a recipe.
    const p = classifyProduct(product());
    expect(p.role).toBe('dish');
    expect(p.priceGross).toBe(10);
  });

  it('makes an ingredient of a kitchen-display modifier', () => {
    // Bacon goes on something else and rings at nothing, which is exactly
    // what makes it an ingredient rather than a dish.
    const p = classifyProduct(product({ name: 'BACON', familia: 'INGREDIENTES', revenue: 0, quantity: 2514 }));
    expect(p.role).toBe('ingredient');
    expect(p.reason).toBe('modifier');
  });

  it('makes an ingredient of a drink, and keeps its selling price', () => {
    // A bottle is poured from no recipe: one cost, and a price to measure
    // the margin against. It is both, so both are kept.
    const p = classifyProduct(product({ name: 'SUPER BOCK', familia: 'BEBIDAS', revenue: 1632.27, quantity: 878 }));
    expect(p.role).toBe('ingredient');
    expect(p.reason).toBe('soldAsBought');
    expect(p.priceGross).toBeCloseTo(1.86, 2);
  });

  it('leaves staff meals and discontinued dishes alone', () => {
    // Real history, but nothing anyone can order — importing them would be
    // a menu to maintain that nobody sells from.
    expect(classifyProduct(product({ familia: 'STAFF' })).role).toBe('skip');
    expect(classifyProduct(product({ familia: 'DESCONTINUADOS' })).role).toBe('skip');
  });

  it('drops the catch-all line named after its own family', () => {
    // The till books "INGREDIENTES" when no specific topping was chosen.
    const p = classifyProduct(product({ name: 'INGREDIENTES', familia: 'INGREDIENTES', revenue: 0, quantity: 2877 }));
    expect(p.role).toBe('skip');
    expect(p.reason).toBe('catchAll');
  });

  it('waits rather than importing a dish at no price', () => {
    // A price invented for something that never sold is a guess wearing the
    // clothes of a fact, and every margin computed from it would be wrong.
    const p = classifyProduct(product({ revenue: 0, quantity: 0 }));
    expect(p.role).toBe('skip');
    expect(p.reason).toBe('noSales');
  });
});

describe('the price a product actually sold at', () => {
  it('is the takings divided by the portions', () => {
    // From what the till charged, not a price list: it already carries the
    // discounts, the menu deals and the rise halfway through the year.
    expect(averagePrice(1000, 100)).toBe(10);
    expect(averagePrice(1632.27, 878)).toBeCloseTo(1.86, 2);
  });

  it('is unknown when nothing sold', () => {
    expect(averagePrice(0, 0)).toBeNull();
    expect(averagePrice(100, 0)).toBeNull();
    expect(averagePrice(0, 50)).toBeNull();
  });
});

describe('which VAT rate a product carries', () => {
  it('charges the alcohol rate on drinks that have alcohol in them', () => {
    // 23% on alcohol against 13% on everything else is the owner's margin;
    // one rate for all drinks would misprice every wine on the list.
    expect(vatRateFor('SUPER BOCK')).toBe(23);
    expect(vatRateFor('Vinho da Casa (jarro)')).toBe(23);
    expect(vatRateFor('CAIPIRINHA')).toBe(23);
    expect(vatRateFor('Saqué (copo)')).toBe(23);
  });

  it('charges the food rate on everything else', () => {
    expect(vatRateFor('COCA-COLA')).toBe(13);
    expect(vatRateFor('ESPRESSO')).toBe(13);
    expect(vatRateFor('SMASHIE DUPLO C/QUEIJO')).toBe(13);
    expect(vatRateFor('AGUA 0.33CL')).toBe(13);
  });

  it('is not fooled by case', () => {
    expect(isAlcohol('cerveja sapporo')).toBe(true);
    expect(isAlcohol('CERVEJA SAPPORO')).toBe(true);
  });
});

describe('the whole catalogue at once', () => {
  const CATALOGUE = [
    product({ id: 'a', name: 'SMASHIE DUPLO C/QUEIJO', familia: 'COMIDAS', revenue: 17833.8, quantity: 1582 }),
    product({ id: 'b', name: 'SMASHIE SIMPLES', familia: 'COMIDAS', revenue: 1628.53, quantity: 276 }),
    product({ id: 'c', name: 'SUPER BOCK', familia: 'BEBIDAS', revenue: 1632.27, quantity: 878 }),
    product({ id: 'd', name: 'BACON', familia: 'INGREDIENTES', revenue: 0, quantity: 2514 }),
    product({ id: 'e', name: 'ALFACE', familia: 'INGREDIENTES', revenue: 0, quantity: 1730 }),
    product({ id: 'f', name: 'MOUSSE DE OREO', familia: 'DESCONTINUADOS', revenue: 214.75, quantity: 86 }),
    product({ id: 'g', name: 'INGREDIENTES', familia: 'INGREDIENTES', revenue: 0, quantity: 2877 }),
  ];

  it('splits the list three ways', () => {
    const plan = planCatalogue(CATALOGUE);
    expect(plan.dishes.map((d) => d.name)).toEqual(['SMASHIE DUPLO C/QUEIJO', 'SMASHIE SIMPLES']);
    expect(plan.ingredients.map((i) => i.name)).toEqual(['BACON', 'ALFACE', 'SUPER BOCK']);
    expect(plan.skipped.map((s) => s.name)).toEqual(['MOUSSE DE OREO', 'INGREDIENTES']);
  });

  it('puts the dish that carries the room first', () => {
    // An owner reviewing a long list should meet the decisions that matter
    // before the ones that do not.
    const plan = planCatalogue(CATALOGUE);
    expect(plan.dishes[0].name).toBe('SMASHIE DUPLO C/QUEIJO');
  });

  it('orders ingredients by how often they are asked for', () => {
    // They all ring at zero, so takings cannot order them.
    const plan = planCatalogue(CATALOGUE);
    expect(plan.ingredients[0].quantity).toBe(2514);
  });

  it('loses nothing: every product lands somewhere', () => {
    const plan = planCatalogue(CATALOGUE);
    expect(plan.dishes.length + plan.ingredients.length + plan.skipped.length).toBe(CATALOGUE.length);
  });
});

describe('guessing what a kitchen buys something in', () => {
  it('pours drinks and sauces by the litre', () => {
    expect(guessPurchaseUnit('COCA-COLA')).toBe('L');
    expect(guessPurchaseUnit('MOLHO HAMBURGUER')).toBe('L');
    expect(guessPurchaseUnit('Azeite virgem extra')).toBe('L');
  });

  it('weighs what is weighed', () => {
    expect(guessPurchaseUnit('BACON')).toBe('kg');
    expect(guessPurchaseUnit('QUEIJO DE CABRA')).toBe('kg');
    expect(guessPurchaseUnit('CEBOLA CARAMELIZADA')).toBe('kg');
  });

  it('counts anything else, which is the safe default', () => {
    // Wrong here costs the owner one dropdown in Preços; wrong on a quantity
    // would cost them a margin they believe.
    expect(guessPurchaseUnit('PAO DE HAMBURGUER')).toBe('un');
    expect(guessPurchaseUnit('OVO ESTRELADO')).toBe('un');
  });
});

describe('the same dish sold twice', () => {
  /**
   * Straight from the real catalogue: the till sells SMASHIE DUPLO C/QUEIJO
   * à la carte in COMIDAS at 7,40 and inside a menu in MENUS at 12,14. They
   * are two products with two margins, and the Ementa would otherwise carry
   * two rows with one name and no way to tell them apart.
   */
  const BOTH = [
    product({ id: 'a', name: 'SMASHIE DUPLO C/QUEIJO', familia: 'MENUS', subFamily: null, revenue: 14204.36, quantity: 1170 }),
    product({ id: 'b', name: 'SMASHIE DUPLO C/QUEIJO', familia: 'COMIDAS', subFamily: 'SMASHIES', revenue: 3629.44, quantity: 490 }),
    product({ id: 'c', name: 'WRAP FRANGO', familia: 'MENUS', revenue: 928, quantity: 100 }),
  ];

  it('names both after their family', () => {
    const plan = planCatalogue(BOTH);
    const names = plan.dishes.map((d) => d.menuName);
    // The sub-family is preferred where there is one, since "SMASHIES"
    // tells the owner more than "COMIDAS" does.
    expect(names).toContain('SMASHIE DUPLO C/QUEIJO (MENUS)');
    expect(names).toContain('SMASHIE DUPLO C/QUEIJO (SMASHIES)');
  });

  it('leaves a name that only one product carries alone', () => {
    // Adding the family to everything would make the whole menu read like
    // a database dump.
    const plan = planCatalogue(BOTH);
    expect(plan.dishes.find((d) => d.id === 'c')!.menuName).toBe('WRAP FRANGO');
  });

  it('keeps each one its own price', () => {
    const plan = planCatalogue(BOTH);
    const menu = plan.dishes.find((d) => d.familia === 'MENUS' && d.name.startsWith('SMASHIE'))!;
    const carte = plan.dishes.find((d) => d.familia === 'COMIDAS')!;
    expect(menu.priceGross).toBeCloseTo(12.14, 2);
    expect(carte.priceGross).toBeCloseTo(7.41, 2);
  });
});

describe('names that must not collide', () => {
  /**
   * The real catalogue has SMASHIE FRANGO under two till codes in the same
   * family and the same sub-family — one presumably recreated at some point.
   * A name that still repeats would be written once and silently dropped the
   * second time by the unique index, losing a dish without saying so.
   */
  it('separates two products the family cannot tell apart', () => {
    const plan = planCatalogue([
      product({ id: 'a', code: '94', name: 'SMASHIE FRANGO', familia: 'COMIDAS', subFamily: 'SMASHIES', revenue: 746.7, quantity: 70 }),
      product({ id: 'b', code: '206', name: 'SMASHIE FRANGO', familia: 'COMIDAS', subFamily: 'SMASHIES', revenue: 100, quantity: 10 }),
    ]);
    const names = plan.dishes.map((d) => d.menuName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses the sub-family before falling back to the code', () => {
    // "PIANINHO BBQ (ESPECIAIS)" reads as a menu; "PIANINHO BBQ [285]" does
    // not, so the code is the last resort rather than the first.
    const plan = planCatalogue([
      product({ id: 'a', code: '285', name: 'PIANINHO BBQ', familia: 'COMIDAS', subFamily: 'ESPECIAIS', revenue: 500, quantity: 50 }),
      product({ id: 'b', code: '296', name: 'PIANINHO BBQ', familia: 'COMIDAS', subFamily: 'ALG. DIFERENTES', revenue: 300, quantity: 30 }),
    ]);
    expect(plan.dishes.map((d) => d.menuName).sort()).toEqual([
      'PIANINHO BBQ (ALG. DIFERENTES)',
      'PIANINHO BBQ (ESPECIAIS)',
    ]);
  });

  it('keeps every dish and ingredient name unique across the whole plan', () => {
    const plan = planCatalogue([
      product({ id: 'a', code: '1', name: 'X', familia: 'COMIDAS', subFamily: null, revenue: 100, quantity: 10 }),
      product({ id: 'b', code: '2', name: 'X', familia: 'COMIDAS', subFamily: null, revenue: 90, quantity: 9 }),
      product({ id: 'c', code: '3', name: 'X', familia: 'COMIDAS', subFamily: null, revenue: 80, quantity: 8 }),
    ]);
    const names = plan.dishes.map((d) => d.menuName.toUpperCase());
    expect(new Set(names).size).toBe(3);
  });
});
