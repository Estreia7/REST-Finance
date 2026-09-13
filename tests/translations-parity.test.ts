import { describe, it, expect } from 'vitest';
import { translations, getTranslation } from '@/lib/translations';

/**
 * Keeps the two languages honest.
 *
 * The dictionary drifts the moment a key is added to one side and forgotten on
 * the other, and nothing at runtime complains: `getTranslation` quietly falls
 * back to Portuguese, so an English user sees Portuguese and we never hear
 * about it. These tests are the thing that notices, at the point the key is
 * added rather than months later.
 */

type Tree = { [key: string]: string | Tree };

/** Every leaf key, flattened to "a.b.c". */
function leafKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : leafKeys(value, path);
  });
}

function valueAt(tree: Tree, path: string): string | Tree | undefined {
  return path.split('.').reduce<string | Tree | undefined>(
    (node, part) => (typeof node === 'object' && node ? node[part] : undefined),
    tree,
  );
}

const pt = translations.pt as unknown as Tree;
const en = translations.en as unknown as Tree;

describe('translation parity', () => {
  it('has an English value for every Portuguese key', () => {
    const missing = leafKeys(pt).filter((key) => typeof valueAt(en, key) !== 'string');
    expect(missing, `Missing from en: ${missing.join(', ')}`).toEqual([]);
  });

  it('has a Portuguese value for every English key', () => {
    const missing = leafKeys(en).filter((key) => typeof valueAt(pt, key) !== 'string');
    expect(missing, `Missing from pt: ${missing.join(', ')}`).toEqual([]);
  });

  it('has the same shape on both sides', () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(pt).sort());
  });

  it('leaves no value empty', () => {
    const empty = [
      ...leafKeys(pt).filter((k) => (valueAt(pt, k) as string).trim() === ''),
      ...leafKeys(en).filter((k) => (valueAt(en, k) as string).trim() === ''),
    ];
    expect(empty, `Empty values: ${empty.join(', ')}`).toEqual([]);
  });

  /**
   * A weak but useful signal: an English value carrying Portuguese diacritics
   * is almost always a copy-paste that was never translated. Words that are
   * genuinely identical in both languages (Email, Total) are fine and stay
   * invisible to this check, because they have no accents to catch.
   */
  it('has no obviously untranslated English values', () => {
    const accented = leafKeys(en).filter((key) =>
      /[ãõçáàâéêíóôúü]/i.test(valueAt(en, key) as string),
    );
    expect(accented, `English values look Portuguese: ${accented.join(', ')}`).toEqual([]);
  });
});

describe('getTranslation', () => {
  it('returns the value for the asked-for language', () => {
    expect(getTranslation('pt', 'common.save')).toBe('Guardar');
    expect(getTranslation('en', 'common.save')).toBe('Save');
  });

  it('returns the key itself when nothing matches, rather than throwing', () => {
    expect(getTranslation('en', 'nope.not.here')).toBe('nope.not.here');
  });
});
