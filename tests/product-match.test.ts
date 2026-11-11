import { describe, expect, it } from 'vitest';
import { matchesProduct, productWords, relatedProducts } from '@/lib/product-match';

// Real wordings from Makro and Recheio invoices.
const MAKRO = 'CERV.SUPER BOCK 24X33CL TP*';
const RECHEIO = 'CERV S BOCK TP 24X33CL';

describe('matchesProduct', () => {
  it('finds Super Bock however the supplier wrote it', () => {
    for (const asked of ['super bock', 'Super Bock', 'superbock', 'bock', 'cerveja super bock', 'sb']) {
      expect(matchesProduct(asked, MAKRO)).toBe(true);
      expect(matchesProduct(asked, RECHEIO)).toBe(true);
    }
  });

  it('ignores accents and punctuation', () => {
    expect(productWords('Açúcar Branco 1KG')).toEqual(['acucar', 'branco', '1kg']);
    expect(matchesProduct('açúcar', 'ACUCAR BRANCO RAR 1KG')).toBe(true);
    expect(matchesProduct('acucar', 'Açúcar branco')).toBe(true);
  });

  it('does not match a different product', () => {
    expect(matchesProduct('super bock', 'AGUA CALDAS PENACOVA 24X33CL')).toBe(false);
    expect(matchesProduct('super bock', 'REF C/G SUMOL ANA LATA 33CL')).toBe(false);
    expect(matchesProduct('bacalhau', 'MC BACON FATIAS 500G')).toBe(false);
    expect(matchesProduct('cerveja sagres', RECHEIO)).toBe(false);
    expect(matchesProduct('cerveja sagres', MAKRO)).toBe(false);
    expect(matchesProduct('', MAKRO)).toBe(false);
  });
});

describe('relatedProducts', () => {
  it('offers names sharing a word when nothing matched', () => {
    expect(relatedProducts('cerveja sagres', [MAKRO, RECHEIO, 'AGUA MONCHIQUE 5LT'])).toEqual([MAKRO, RECHEIO]);
  });
});
