import { describe, it, expect } from 'vitest';
import { matchesSearch } from '@/app/dashboard/components/ListSearch';

describe('searching a list', () => {
  it('ignores case', () => {
    expect(matchesSearch('bacon', 'BACON')).toBe(true);
    expect(matchesSearch('BACON', 'bacon')).toBe(true);
  });

  it('ignores accents, because nobody types them into a search box', () => {
    // An owner looking for PÃO types "pao" and should not have to know
    // which spelling the till used.
    expect(matchesSearch('pao', 'PÃO HAMBURGUER')).toBe(true);
    expect(matchesSearch('PÃO', 'PAO HAMBURGUER')).toBe(true);
    expect(matchesSearch('limao', 'AGUA DAS PEDRAS LIMÃO')).toBe(true);
  });

  it('matches a word anywhere in the name', () => {
    expect(matchesSearch('cebola', 'CEBOLA CARAMELIZADA')).toBe(true);
    expect(matchesSearch('caramelizada', 'CEBOLA CARAMELIZADA')).toBe(true);
  });

  it('matches several words in any order', () => {
    // How people search when they half-remember a name.
    expect(matchesSearch('bacon extra', 'EXTRA BACON')).toBe(true);
    expect(matchesSearch('queijo cheddar', 'CHEDDAR QUEIJO RALADO')).toBe(true);
  });

  it('requires every word, not just one', () => {
    // Otherwise "queijo cabra" would return every cheese in the list.
    expect(matchesSearch('queijo cabra', 'QUEIJO CHEDDAR')).toBe(false);
  });

  it('searches across several fields', () => {
    // An ingredient found by its supplier, a product by its till code.
    expect(matchesSearch('makro', 'BACON', 'MAKRO')).toBe(true);
    expect(matchesSearch('301', 'CEBOLA CARAMELIZADA', '301')).toBe(true);
  });

  it('ignores fields that are not there', () => {
    expect(matchesSearch('bacon', 'BACON', null, undefined)).toBe(true);
  });

  it('matches everything when nothing is typed', () => {
    // An empty box is not a filter.
    expect(matchesSearch('', 'ANYTHING')).toBe(true);
    expect(matchesSearch('   ', 'ANYTHING')).toBe(true);
  });

  it('matches nothing that does not contain the term', () => {
    expect(matchesSearch('bacon', 'ALFACE')).toBe(false);
  });

  it('matches a partial word, since searching happens while typing', () => {
    expect(matchesSearch('bac', 'BACON')).toBe(true);
    expect(matchesSearch('carame', 'CEBOLA CARAMELIZADA')).toBe(true);
  });

  it('finds the real ingredients an owner would look for', () => {
    // Straight from the account: 94 ingredients, which is why this exists.
    const list = [
      'AGUA DAS PEDRAS LIMÃO', 'ALFACE', 'AMERICAN COOKIE', 'BACON',
      'BATATA FRITA DOCE', 'CEBOLA CARAMELIZADA', 'EXTRA BACON', 'PÃO HAMBURGUER',
    ];
    const find = (term: string) => list.filter((n) => matchesSearch(term, n));

    expect(find('bacon')).toEqual(['BACON', 'EXTRA BACON']);
    expect(find('agua')).toEqual(['AGUA DAS PEDRAS LIMÃO']);
    expect(find('batata')).toEqual(['BATATA FRITA DOCE']);
    expect(find('zzz')).toEqual([]);
  });
});
