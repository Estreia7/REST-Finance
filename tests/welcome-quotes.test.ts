import { describe, it, expect } from 'vitest';
import {
  getQuotes,
  quoteAt,
  pickQuoteIndex,
  greetingName,
  type WelcomeAudience,
} from '@/lib/welcome-quotes';

const AUDIENCES: WelcomeAudience[] = ['owner', 'admin'];

describe('welcome quote pools', () => {
  it.each(AUDIENCES)('has 25 quotes for %s in both languages', (audience) => {
    expect(getQuotes(audience, 'pt')).toHaveLength(25);
    expect(getQuotes(audience, 'en')).toHaveLength(25);
  });

  it.each(AUDIENCES)('keeps %s quotes non-empty and unique', (audience) => {
    for (const lang of ['pt', 'en'] as const) {
      const pool = getQuotes(audience, lang);
      expect(pool.every((q) => q.trim().length > 0)).toBe(true);
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('keeps the two audiences distinct', () => {
    const owner = new Set(getQuotes('owner', 'pt'));
    const overlap = getQuotes('admin', 'pt').filter((q) => owner.has(q));
    expect(overlap).toEqual([]);
  });

  it('resolves an index to the same slot in either language', () => {
    // The splash draws an index once and re-reads it when the language
    // changes; misaligned pools would swap the quote, not just translate it.
    for (const audience of AUDIENCES) {
      for (let i = 0; i < 25; i++) {
        expect(quoteAt(audience, 'pt', i)).toBe(getQuotes(audience, 'pt')[i]);
        expect(quoteAt(audience, 'en', i)).toBe(getQuotes(audience, 'en')[i]);
      }
    }
  });

  it('wraps an out-of-range index rather than returning undefined', () => {
    expect(quoteAt('owner', 'pt', 25)).toBe(getQuotes('owner', 'pt')[0]);
    expect(quoteAt('owner', 'pt', -1)).toBe(getQuotes('owner', 'pt')[24]);
  });

  it('only ever picks an index inside the pool', () => {
    for (const audience of AUDIENCES) {
      for (let i = 0; i < 500; i++) {
        const index = pickQuoteIndex(audience);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(25);
        expect(Number.isInteger(index)).toBe(true);
      }
    }
  });
});

describe('greetingName', () => {
  it('greets by first name only', () => {
    expect(greetingName('Bruno Estreia', 'b@x.pt')).toBe('Bruno');
    expect(greetingName('  Ana   Maria Silva ', null)).toBe('Ana');
  });

  it('falls back to the email local part, tidied and capitalised', () => {
    expect(greetingName(null, 'joao.silva@rest.pt')).toBe('Joao');
    expect(greetingName('   ', 'maria_costa@rest.pt')).toBe('Maria');
  });

  it('returns empty when there is nothing to greet by', () => {
    // The splash then greets without a name rather than with a placeholder.
    expect(greetingName(null, null)).toBe('');
    expect(greetingName('', '')).toBe('');
  });
});
