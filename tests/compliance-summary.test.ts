import { describe, it, expect } from 'vitest';
import { summarise, REQUIRED_DOC_TYPES } from '@/lib/compliance';

const NOW = new Date('2026-09-12T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/** A full set of the four required documents, all comfortably in date. */
const allRequired = () =>
  REQUIRED_DOC_TYPES.map((type) => ({ type, expiresAt: inDays(200) }));

describe('summarise', () => {
  it('reports every required type as missing when the vault is empty', () => {
    const summary = summarise([], NOW);

    expect(summary.missingTypes).toEqual([...REQUIRED_DOC_TYPES]);
    expect(summary.totalDocs).toBe(0);
    // An empty vault is the opposite of being up to date, and saying
    // otherwise would be the worst possible thing this screen could do.
    expect(summary.allClear).toBe(false);
  });

  it('declares all clear once every required document is on file and in date', () => {
    const summary = summarise(allRequired(), NOW);

    expect(summary.missingTypes).toEqual([]);
    expect(summary.expiredCount).toBe(0);
    expect(summary.expiringCount).toBe(0);
    expect(summary.allClear).toBe(true);
  });

  it('counts an expired document as missing, not merely present', () => {
    const docs = allRequired();
    docs[0] = { type: 'INSURANCE', expiresAt: inDays(-5) };

    const summary = summarise(docs, NOW);

    // A lapsed insurance is the same problem as no insurance on the day
    // an inspector asks to see it.
    expect(summary.missingTypes).toContain('INSURANCE');
    expect(summary.expiredCount).toBe(1);
    expect(summary.allClear).toBe(false);
  });

  it('does not call a type missing when a second copy is still valid', () => {
    // Last year's policy sits alongside this year's renewal.
    const docs = [
      ...allRequired(),
      { type: 'INSURANCE', expiresAt: inDays(-200) },
    ];

    const summary = summarise(docs, NOW);

    expect(summary.missingTypes).toEqual([]);
    expect(summary.expiredCount).toBe(1);
    // Still not all clear: the lapsed copy is worth showing.
    expect(summary.allClear).toBe(false);
  });

  it('withholds all clear while something is inside the notice window', () => {
    const docs = allRequired();
    docs[1] = { type: 'HACCP', expiresAt: inDays(9) };

    const summary = summarise(docs, NOW);

    expect(summary.missingTypes).toEqual([]);
    expect(summary.expiringCount).toBe(1);
    expect(summary.allClear).toBe(false);
  });

  it('ignores extra documents beyond the required set when judging gaps', () => {
    const docs = [
      ...allRequired(),
      { type: 'PEST_CONTROL', expiresAt: inDays(300) },
      { type: 'OTHER', expiresAt: null },
    ];

    const summary = summarise(docs, NOW);

    expect(summary.missingTypes).toEqual([]);
    expect(summary.totalDocs).toBe(6);
    expect(summary.allClear).toBe(true);
  });

  it('treats a document without an expiry as permanently in force', () => {
    const docs = REQUIRED_DOC_TYPES.map((type) => ({ type, expiresAt: null }));

    const summary = summarise(docs, NOW);

    expect(summary.missingTypes).toEqual([]);
    expect(summary.expiringCount).toBe(0);
    expect(summary.allClear).toBe(true);
  });
});
