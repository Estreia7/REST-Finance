import { describe, it, expect } from 'vitest';
import {
  significantWords,
  similarity,
  matchLine,
  reconcileInvoice,
  lineArithmeticHolds,
  impliedUnitPrice,
  findAliasCandidates,
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
