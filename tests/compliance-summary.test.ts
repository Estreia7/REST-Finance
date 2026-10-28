import { describe, it, expect } from 'vitest';
import { summarise, EXPIRY_WARNING_DAYS } from '@/lib/compliance';

const NOW = new Date('2026-09-12T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('summarise', () => {
  it('does not call an empty vault up to date', () => {
    const summary = summarise([], NOW);

    expect(summary.allClear).toBe(false);
    expect(summary.totalDocs).toBe(0);
  });

  it('is all clear when every document is in date', () => {
    const summary = summarise(
      [
        { name: 'Seguro', expiresAt: inDays(200) },
        { name: 'Plano HACCP', expiresAt: null },
      ],
      NOW,
    );

    expect(summary.allClear).toBe(true);
    expect(summary.expired).toEqual([]);
    expect(summary.expiring).toEqual([]);
  });

  it('judges each document by its own date, and names it', () => {
    const summary = summarise(
      [
        { name: 'Seguro', expiresAt: inDays(-3) },
        { name: 'Licença', expiresAt: inDays(EXPIRY_WARNING_DAYS) },
        { name: 'Pragas', expiresAt: inDays(EXPIRY_WARNING_DAYS + 1) },
      ],
      NOW,
    );

    expect(summary.allClear).toBe(false);
    expect(summary.expired).toEqual(['Seguro']);
    expect(summary.expiring).toEqual(['Licença']);
    expect(summary.totalDocs).toBe(3);
  });

  it('does not require any particular document to be on file', () => {
    // Only what the owner keeps is judged: a vault with a single valid
    // contract is in order, whatever it lacks.
    const summary = summarise([{ name: 'Recolha de resíduos', expiresAt: inDays(60) }], NOW);

    expect(summary.allClear).toBe(true);
  });
});
