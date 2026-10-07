import { describe, it, expect } from 'vitest';
import {
  significantWords,
  similarity,
  matchLine,
  reconcileInvoice,
  lineArithmeticHolds,
  impliedUnitPrice,
  findAliasCandidates,
  packSizeOf,
  inPurchaseUnits,
  packConversion,
  type MatchCandidate,
} from '@/lib/invoice-matching';

const KITCHEN: MatchCandidate[] = [
  { id: 'i1', name: 'Carne Smash', unit: 'kg' },
  { id: 'i2', name: 'Pão Hamburguer', unit: 'un' },
  { id: 'i3', name: 'QUEIJO CHEDDAR', unit: 'kg' },
  { id: 'i4', name: 'BACON', unit: 'kg' },
  { id: 'i5', name: 'Carne de Porco', unit: 'kg' },
];

describe('reducing a name to what identifies it', () => {
  it('drops packaging, units and filler', () => {
    expect(significantWords('CARNE PICADA NOVILHO 80/20 KG')).toEqual([
      'carne', 'picada', 'novilho',
    ]);
  });

  it('ignores accents, because a supplier types PAO as often as PÃO', () => {
    expect(significantWords('PÃO HAMBÚRGUER')).toEqual(['pao', 'hamburguer']);
    expect(significantWords('PAO HAMBURGUER')).toEqual(['pao', 'hamburguer']);
  });

  it('drops the words that describe the packet rather than the product', () => {
    expect(significantWords('QUEIJO CHEDDAR CX 2,5KG CONGELADO')).toEqual([
      'queijo', 'cheddar',
    ]);
  });
});

describe('how alike two names are', () => {
  it('scores a name contained in a longer one on the shorter one', () => {
    // The supplier's extra detail should not count against the match.
    expect(similarity('Carne Smash', 'CARNE SMASH 80/20 KG')).toBe(1);
  });

  it('ignores word order', () => {
    expect(similarity('queijo cheddar', 'CHEDDAR QUEIJO')).toBe(1);
  });

  it('scores an unrelated name at nothing', () => {
    expect(similarity('Carne Smash', 'DETERGENTE LOIÇA')).toBe(0);
  });

  it('gives a partial score to a partial overlap', () => {
    const s = similarity('Carne Smash', 'CARNE PICADA NOVILHO');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
});

describe('matching one invoice line', () => {
  it('links without asking when every word matches', () => {
    const m = matchLine('CARNE SMASH 80/20 KG', KITCHEN);
    expect(m.certain?.name).toBe('Carne Smash');
  });

  it('asks rather than guessing on a partial match', () => {
    // Straight from the real invoice. "Carne Picada Novilho" shares only
    // "carne" with "Carne Smash" — and one word in common is exactly how
    // "Carne Smash" would get linked to "Carne de Porco" instead.
    const m = matchLine('Carne Picada Novilho', KITCHEN);
    expect(m.certain).toBeNull();
    expect(m.suggestions.map((s) => s.name)).toContain('Carne Smash');
  });

  it('asks when two candidates score the same', () => {
    // The case where guessing is worst: the owner knows which, we do not.
    const m = matchLine('CARNE', KITCHEN);
    expect(m.certain).toBeNull();
  });

  it('offers nothing when nothing resembles it', () => {
    const m = matchLine('DETERGENTE MAQUINA LOIÇA 5L', KITCHEN);
    expect(m.certain).toBeNull();
    expect(m.suggestions).toHaveLength(0);
  });

  it('never offers more than three', () => {
    const many: MatchCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`, name: `CARNE TIPO ${i}`, unit: 'kg',
    }));
    expect(matchLine('CARNE', many).suggestions.length).toBeLessThanOrEqual(3);
  });

  it('uses what the owner already confirmed, without asking again', () => {
    // The whole point: one answer per product, ever.
    const m = matchLine('Carne Picada Novilho', KITCHEN, ['i1']);
    expect(m.certain?.name).toBe('Carne Smash');
    expect(m.suggestions).toHaveLength(0);
  });

  it('falls back to guessing if the remembered ingredient is gone', () => {
    // Deleted since. Pointing at nothing must not silently link to nothing.
    const m = matchLine('Carne Picada Novilho', KITCHEN, ['deleted']);
    expect(m.certain).toBeNull();
  });
});

describe('a whole invoice', () => {
  const LINES = [
    { productName: 'Carne Picada Novilho', quantity: 7.945, unit: 'kg', unitPrice: 9.9, total: 78.66 },
    { productName: 'CARNE SMASH 80/20', quantity: 2, unit: 'kg', unitPrice: 10, total: 20 },
    { productName: 'DETERGENTE LOIÇA', quantity: 1, unit: 'un', unitPrice: 4.5, total: 4.5 },
  ];

  it('files each line as linked, to ask, or new', () => {
    const out = reconcileInvoice(LINES, KITCHEN);
    const byName = new Map(out.map((l) => [l.productName, l.decision.kind]));
    expect(byName.get('CARNE SMASH 80/20')).toBe('linked');
    expect(byName.get('Carne Picada Novilho')).toBe('ask');
    expect(byName.get('DETERGENTE LOIÇA')).toBe('new');
  });

  it('puts the line that costs most first', () => {
    // The owner should meet the decision that moves their margin before the
    // one about a bottle of washing-up liquid.
    const out = reconcileInvoice(LINES, KITCHEN);
    expect(out[0].productName).toBe('Carne Picada Novilho');
  });

  it('says how much of the invoice each line is', () => {
    const out = reconcileInvoice(LINES, KITCHEN);
    const meat = out.find((l) => l.productName === 'Carne Picada Novilho')!;
    expect(meat.share).toBeCloseTo(76.2, 0);
  });

  it('asks nothing for a supplier whose lines are all remembered', () => {
    const remembered = new Map([['carne picada novilho', ['i1']]]);
    const out = reconcileInvoice(LINES, KITCHEN, remembered);
    expect(out.filter((l) => l.decision.kind === 'ask')).toHaveLength(0);
  });
});

describe('checking a line adds up', () => {
  it('accepts the real invoice line', () => {
    // 7,945 kg × 9,90 = 78,66. The figures from the photograph.
    expect(lineArithmeticHolds({
      productName: 'Carne Picada Novilho', quantity: 7.945, unit: 'kg', unitPrice: 9.9, total: 78.66,
    })).toBe(true);
  });

  it('catches a misread unit price', () => {
    // A wrong unit price becomes a wrong ingredient cost, which becomes a
    // wrong margin on every dish using it — and none of that announces
    // itself, which is why the line is checked at all.
    expect(lineArithmeticHolds({
      productName: 'X', quantity: 7.945, unit: 'kg', unitPrice: 99, total: 78.66,
    })).toBe(false);
  });

  it('allows a cent of rounding, as suppliers do', () => {
    expect(lineArithmeticHolds({
      productName: 'X', quantity: 3, unit: 'kg', unitPrice: 1.333, total: 4.0,
    })).toBe(true);
  });

  it('rejects a line with no quantity, rather than dividing by it', () => {
    expect(lineArithmeticHolds({
      productName: 'X', quantity: 0, unit: 'kg', unitPrice: 10, total: 10,
    })).toBe(false);
  });

  it('recovers the unit price from the two figures least likely to be wrong', () => {
    expect(impliedUnitPrice({
      productName: 'X', quantity: 7.945, unit: 'kg', unitPrice: 0, total: 78.66,
    })).toBeCloseTo(9.9, 2);
  });

  it('recovers nothing without a quantity', () => {
    expect(impliedUnitPrice({
      productName: 'X', quantity: 0, unit: 'kg', unitPrice: 0, total: 10,
    })).toBeNull();
  });
});

describe('one purchase feeding several ingredients', () => {
  /**
   * The owner's own observation, and the data agrees: "Carne Smash" and
   * "EXTRA CARNE" are both the same meat — one bought case, served two ways.
   * Forcing a single choice would make them pick which of their own
   * ingredients to leave uncosted.
   */
  it('links a line to every ingredient confirmed for it', () => {
    const m = matchLine('Carne Picada Novilho', KITCHEN, ['i1', 'i5']);
    expect(m.remembered?.map((r) => r.name)).toEqual(['Carne Smash', 'Carne de Porco']);
  });

  it('carries them all through the reconciliation', () => {
    const out = reconcileInvoice(
      [{ productName: 'Carne Picada Novilho', quantity: 8, unit: 'kg', unitPrice: 9.9, total: 79.2 }],
      KITCHEN,
      new Map([['carne picada novilho', ['i1', 'i5']]]),
    );
    const decision = out[0].decision;
    expect(decision.kind).toBe('linked');
    if (decision.kind === 'linked') {
      expect(decision.ingredients).toHaveLength(2);
    }
  });

  it('ignores ingredients deleted since the link was made', () => {
    const m = matchLine('Carne Picada Novilho', KITCHEN, ['i1', 'gone']);
    expect(m.remembered).toHaveLength(1);
    expect(m.remembered?.[0].name).toBe('Carne Smash');
  });

  it('offers the other ingredients that share a word, even once linked', () => {
    // The owner's report: the line linked itself to "Carne Picada Novilho"
    // and the two other meats had to be hunted for in a list of ninety.
    const kitchen: MatchCandidate[] = [
      ...KITCHEN,
      { id: 'i6', name: 'Carne Picada Novilho', unit: 'kg' },
      { id: 'i7', name: 'EXTRA CARNE', unit: 'kg' },
    ];
    const m = matchLine('Carne Picada Novilho', kitchen);
    expect(m.certain?.name).toBe('Carne Picada Novilho');
    expect(m.related.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Carne Smash', 'EXTRA CARNE', 'Carne de Porco']),
    );
    expect(m.related.map((r) => r.id)).not.toContain('i6');
    expect(m.related.map((r) => r.name)).not.toContain('BACON');
  });

  it('offers related ingredients beside the remembered ones, never repeating them', () => {
    const m = matchLine('Carne Picada Novilho', KITCHEN, ['i1']);
    expect(m.related.map((r) => r.name)).toEqual(['Carne de Porco']);
  });

  it('carries the related ingredients into the decision', () => {
    const [line] = reconcileInvoice(
      [{ productName: 'Carne Picada Novilho', quantity: 8, unit: 'kg', unitPrice: 9.9, total: 79.2 }],
      KITCHEN,
      new Map([['carne picada novilho', ['i1']]]),
    );
    expect(line.decision.kind).toBe('linked');
    if (line.decision.kind === 'linked') {
      expect(line.decision.related.map((r) => r.name)).toEqual(['Carne de Porco']);
    }
  });

  it('falls back to guessing when every remembered ingredient is gone', () => {
    // Linking to nothing would be worse than asking again.
    const m = matchLine('Carne Picada Novilho', KITCHEN, ['gone', 'also-gone']);
    expect(m.certain).toBeNull();
    expect(m.suggestions.length).toBeGreaterThan(0);
  });
});

describe('finding ingredients counted twice', () => {
  /**
   * Real data from the account: the POS brought its modifiers across as
   * ingredients, so the kitchen holds both "Carne Smash" (in 4 recipes) and
   * "EXTRA CARNE" (in none). Same meat, two rows, two costs free to drift.
   */
  const REAL = [
    { id: 'a', name: 'Carne Smash', recipeCount: 4 },
    { id: 'b', name: 'EXTRA CARNE', recipeCount: 0 },
    { id: 'c', name: 'BACON', recipeCount: 2 },
    { id: 'd', name: 'EXTRA BACON', recipeCount: 0 },
    { id: 'e', name: 'QUEIJO CHEDDAR', recipeCount: 3 },
    { id: 'f', name: 'EXTRA CHEDDAR', recipeCount: 0 },
    { id: 'g', name: 'ENERGIA EXTRA', recipeCount: 0 },
  ];

  it('pairs each portion with the ingredient it is a portion of', () => {
    const found = findAliasCandidates(REAL);
    const pairs = found.map((f) => `${f.duplicate.name} → ${f.original.name}`);
    expect(pairs).toContain('EXTRA CARNE → Carne Smash');
    expect(pairs).toContain('EXTRA BACON → BACON');
    expect(pairs).toContain('EXTRA CHEDDAR → QUEIJO CHEDDAR');
  });

  it('leaves alone a portion of nothing it recognises', () => {
    // "ENERGIA EXTRA" is a drink, not a portion of an ingredient. Nothing
    // in the kitchen matches "energia", so it is not proposed.
    const found = findAliasCandidates(REAL);
    expect(found.map((f) => f.duplicate.name)).not.toContain('ENERGIA EXTRA');
  });

  it('never proposes merging something a recipe uses', () => {
    // An ingredient in a recipe is one the owner has already said is real.
    const found = findAliasCandidates(REAL);
    expect(found.map((f) => f.duplicate.name)).not.toContain('Carne Smash');
    expect(found.map((f) => f.duplicate.name)).not.toContain('BACON');
  });

  it('proposes nothing when there is nothing to merge', () => {
    expect(findAliasCandidates([
      { id: 'a', name: 'Carne Smash', recipeCount: 4 },
      { id: 'b', name: 'BACON', recipeCount: 2 },
    ])).toEqual([]);
  });

  it('does not pair two unused ingredients with each other', () => {
    // Neither is established, so there is no original to merge into.
    expect(findAliasCandidates([
      { id: 'a', name: 'EXTRA CARNE', recipeCount: 0 },
      { id: 'b', name: 'CARNE', recipeCount: 0 },
    ])).toEqual([]);
  });
});

describe('wholesale lines billed two different ways', () => {
  /**
   * From a real Makro invoice, which prints two quantities per line:
   *
   *   COSTELINHA   PR Unit/KG 5,490 | Unit/KG 3,840 | U.V. 21,08 | Quant 1
   *   KETCHUP 5,7KG  PR Unit/KG 16,990 | Unit/KG 1  | U.V. 16,99 | Quant 1
   *
   * The first was billed by weight: 3,840 kg at 5,49. The second by the
   * package: one tub that happens to hold 5,7 kg. Reading the pack column as
   * the quantity would cost the pork at 21,08 a kilo; reading the pack size
   * out of the description would cost the ketchup at 2,98 a kilo. Both are
   * wrong, and both would quietly reprice every dish using them.
   */
  it('accepts a line billed by weight', () => {
    expect(lineArithmeticHolds({
      productName: 'COSTELINHA/PIANOS PORCO', quantity: 3.84, unit: 'kg', unitPrice: 5.49, total: 21.08,
    })).toBe(true);
  });

  it('accepts a line billed by the package', () => {
    expect(lineArithmeticHolds({
      productName: 'KETCHUP 5,7KG HEINZ', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    })).toBe(true);
  });

  it('catches the pack count read as a weight', () => {
    // 1 × 5,49 is 5,49, not 21,08 — so the line does not add up and is
    // flagged rather than saved as a cost per kilo four times too high.
    expect(lineArithmeticHolds({
      productName: 'COSTELINHA/PIANOS PORCO', quantity: 1, unit: 'kg', unitPrice: 5.49, total: 21.08,
    })).toBe(false);
  });

  it('recovers the weight price when the pack count was read instead', () => {
    // The total and the quantity are the two figures least likely to be
    // misread, so the price comes back from them.
    expect(impliedUnitPrice({
      productName: 'COSTELINHA', quantity: 3.84, unit: 'kg', unitPrice: 0, total: 21.08,
    })).toBeCloseTo(5.49, 2);
  });

  it('catches the pack size read out of the description', () => {
    // "KETCHUP 5,7KG" is one tub, not 5,7 kg of ketchup.
    expect(lineArithmeticHolds({
      productName: 'KETCHUP 5,7KG HEINZ', quantity: 5.7, unit: 'kg', unitPrice: 16.99, total: 16.99,
    })).toBe(false);
  });
});

describe('reading the pack size out of a product name', () => {
  it('reads kilos and litres', () => {
    expect(packSizeOf('TOPPING MORANGO 1KG CART D\'OR')).toEqual({ amount: 1, unit: 'kg' });
    expect(packSizeOf('KETCHUP 5,7KG HEINZ')).toEqual({ amount: 5.7, unit: 'kg' });
    expect(packSizeOf('AGUA 1.5L')).toEqual({ amount: 1.5, unit: 'L' });
  });

  it('converts grams and millilitres to what the kitchen buys in', () => {
    expect(packSizeOf('MOLHO BBQ 500G')).toEqual({ amount: 0.5, unit: 'kg' });
    expect(packSizeOf('AZEITE 750ML')).toEqual({ amount: 0.75, unit: 'L' });
    expect(packSizeOf('COCA COLA 33CL')).toEqual({ amount: 0.33, unit: 'L' });
    // "0.33CL" is a bottle written loosely — 0,33 litres, not 0,33
    // centilitres. The notation is not reliable enough to act on, so it is
    // left alone rather than guessed at.
    expect(packSizeOf('AGUA 0.33CL')).toBeNull();
  });

  it('takes the last size, which is the one describing the package', () => {
    // "CX 6" is how many tubs; the kilo is what one tub holds.
    expect(packSizeOf('CART D\'OR 1KG CX 6')).toEqual({ amount: 1, unit: 'kg' });
  });

  it('ignores a number that is not a size', () => {
    expect(packSizeOf('COSTELINHA/PIANOS PORCO')).toBeNull();
    expect(packSizeOf('SMASHIE DUPLO C/QUEIJO')).toBeNull();
    // Too small to be a pack: a strength, or part of a name.
    expect(packSizeOf('MOLHO PIRI PIRI 10G')).toBeNull();
  });
});

describe('restating a line in the unit the kitchen buys in', () => {
  /**
   * The owner's point, and the costing proves it: an ingredient stored in
   * "un" cannot be used by a recipe that measures in grams — `unitFactor`
   * returns null for g→un, so the dish cannot be costed at all.
   */
  it('turns one 1 kg tub into one kilo', () => {
    const out = inPurchaseUnits({
      productName: 'TOPPING MORANGO 1KG CART D\'OR',
      quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    });
    expect(out.quantity).toBe(1);
    expect(out.unit).toBe('kg');
    expect(out.unitPrice).toBeCloseTo(16.99, 2);
  });

  it('leaves a 5,7 kg tub for the owner to decide', () => {
    // Both readings are sound and getting it wrong puts 16,99 a kilo on
    // something that cost 2,98, so this one is asked rather than assumed.
    // The two options are in the test above.
    const out = inPurchaseUnits({
      productName: 'KETCHUP 5,7KG HEINZ',
      quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    });
    expect(out.quantity).toBe(1);
    expect(out.unit).toBe('un');
  });

  it('keeps the line total exactly', () => {
    // The money is not being restated, only how it is counted.
    const line = {
      productName: 'TOPPING MORANGO 1KG', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    };
    const out = inPurchaseUnits(line);
    expect(out.total).toBe(line.total);
    expect(out.quantity * out.unitPrice).toBeCloseTo(line.total, 2);
  });

  it('multiplies several packages', () => {
    const out = inPurchaseUnits({
      productName: 'TOPPING CHOCOLATE 1KG', quantity: 6, unit: 'un', unitPrice: 6.36, total: 38.16,
    });
    expect(out.quantity).toBe(6);
    expect(out.unit).toBe('kg');
    expect(out.unitPrice).toBeCloseTo(6.36, 2);
  });

  it('leaves a line already billed by weight alone', () => {
    // 3,84 kg of pork is a weight; nothing to restate.
    const line = {
      productName: 'COSTELINHA/PIANOS PORCO', quantity: 3.84, unit: 'kg', unitPrice: 5.49, total: 21.08,
    };
    expect(inPurchaseUnits(line)).toEqual(line);
  });

  it('leaves a line with no pack size alone', () => {
    const line = {
      productName: 'SACO PLASTICO', quantity: 10, unit: 'un', unitPrice: 0.2, total: 2,
    };
    expect(inPurchaseUnits(line)).toEqual(line);
  });

  it('refuses a fractional quantity, which is a weight read badly', () => {
    // 2,5 "packages" of a 1 kg tub would invent goods. Left as it came.
    const line = {
      productName: 'TOPPING MORANGO 1KG', quantity: 2.5, unit: 'un', unitPrice: 16.99, total: 42.48,
    };
    expect(inPurchaseUnits(line)).toEqual(line);
  });
});

describe('when to ask and when to just convert', () => {
  /**
   * Both readings of a package line are arithmetically sound — one tub at
   * 16,99 and 5,7 kilos at 2,98 both come to 16,99 — which is why the model
   * cannot settle it and why the owner is asked. Except where the package is
   * one kilo: there a unit *is* a kilo, and asking would be noise.
   */
  it('converts a one-kilo tub without asking', () => {
    const c = packConversion({
      productName: 'TOPPING MORANGO 1KG', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    });
    expect(c?.certain).not.toBeNull();
    expect(c?.certain?.unit).toBe('kg');
    expect(c?.certain?.quantity).toBe(1);
  });

  it('converts six one-kilo tubs without asking', () => {
    const c = packConversion({
      productName: 'TOPPING CHOCOLATE 1KG', quantity: 6, unit: 'un', unitPrice: 6.36, total: 38.16,
    });
    expect(c?.certain?.quantity).toBe(6);
    expect(c?.certain?.unit).toBe('kg');
  });

  it('asks about a 5,7 kg tub', () => {
    // Getting this wrong puts 16,99 a kilo on something that cost 2,98.
    const c = packConversion({
      productName: 'KETCHUP 5,7KG HEINZ', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    });
    expect(c?.certain).toBeNull();
    expect(c?.asPackages.quantity).toBe(1);
    expect(c?.asWeight.quantity).toBeCloseTo(5.7, 3);
    expect(c?.asWeight.unitPrice).toBeCloseTo(2.98, 2);
  });

  it('asks about twelve 1,5 litre bottles', () => {
    // 12 bottles or 18 litres: both true, and which to store depends on
    // whether the water is sold or cooked with.
    const c = packConversion({
      productName: 'AGUA 1.5L', quantity: 12, unit: 'un', unitPrice: 0.45, total: 5.4,
    });
    expect(c?.certain).toBeNull();
    expect(c?.asWeight.quantity).toBeCloseTo(18, 3);
    expect(c?.asWeight.unit).toBe('L');
  });

  it('has nothing to ask about a line already weighed', () => {
    expect(packConversion({
      productName: 'COSTELINHA PORCO', quantity: 3.84, unit: 'kg', unitPrice: 5.49, total: 21.08,
    })).toBeNull();
  });

  it('has nothing to ask about a name with no size', () => {
    expect(packConversion({
      productName: 'SACO PLASTICO', quantity: 10, unit: 'un', unitPrice: 0.2, total: 2,
    })).toBeNull();
  });

  it('keeps both readings tying to the same total', () => {
    // Whichever the owner picks, the money is unchanged.
    const c = packConversion({
      productName: 'KETCHUP 5,7KG', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    })!;
    expect(c.asPackages.quantity * c.asPackages.unitPrice).toBeCloseTo(16.99, 2);
    expect(c.asWeight.quantity * c.asWeight.unitPrice).toBeCloseTo(16.99, 2);
    expect(c.asPackages.total).toBe(c.asWeight.total);
  });

  it('still converts the certain ones through the old entry point', () => {
    // inPurchaseUnits applies only what needs no asking, so anything calling
    // it keeps working and never silently picks a side.
    const tub = inPurchaseUnits({
      productName: 'TOPPING MORANGO 1KG', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    });
    expect(tub.unit).toBe('kg');

    const ketchup = inPurchaseUnits({
      productName: 'KETCHUP 5,7KG', quantity: 1, unit: 'un', unitPrice: 16.99, total: 16.99,
    });
    expect(ketchup.unit).toBe('un');
  });
});
