import { describe, it, expect } from 'vitest';
import {
  resolveDerrama, derramaTableFor, findMunicipality, turnoverRuleMet, ruleChoice,
  isDerramaChoice, DERRAMA_MUNICIPAL_CEILING,
} from '@/lib/derrama';
import { MUNICIPALITIES } from '@/lib/municipalities';
import { DERRAMA_2025 } from '@/lib/derrama-2025';

/**
 * The derrama table is the Tax Authority's, for the 2025 tax period
 * (Ofício Circulado 20288/2026). The spot checks below were read off the
 * circular's own pages; if one fails after regenerating, the table changed or
 * the extraction broke — look before updating the expectation.
 */
describe('the 2025 table', () => {
  it('has every one of the 308 municipalities, once', () => {
    expect(MUNICIPALITIES).toHaveLength(308);
    expect(new Set(MUNICIPALITIES.map((m) => m.code)).size).toBe(308);
    for (const m of MUNICIPALITIES) expect(DERRAMA_2025.byCode[m.code]).toBeDefined();
  });

  it('has the right number of councils per district', () => {
    const count = (d: string) => MUNICIPALITIES.filter((m) => m.district === d).length;
    expect(count('Aveiro')).toBe(19);
    expect(count('Faro')).toBe(16);
    expect(count('Lisboa')).toBe(16);
    expect(count('Porto')).toBe(18);
    expect(count('Viseu')).toBe(24);
    expect(count('Funchal')).toBe(11);
  });

  it('never exceeds the legal ceiling', () => {
    for (const council of Object.values(DERRAMA_2025.byCode)) {
      if (council.generalRate !== null) {
        expect(council.generalRate).toBeGreaterThan(0);
        expect(council.generalRate).toBeLessThanOrEqual(DERRAMA_MUNICIPAL_CEILING);
      }
      for (const rule of council.rules) {
        expect(rule.rate).toBeGreaterThanOrEqual(0);
        expect(rule.rate).toBeLessThanOrEqual(DERRAMA_MUNICIPAL_CEILING);
        if (rule.kind === 'exempt') expect(rule.rate).toBe(0);
        if (rule.kind === 'reduced') expect(rule.rate).toBeGreaterThan(0);
        expect(rule.scope.length).toBeGreaterThan(0);
      }
    }
  });

  it('matches the circular where it was hardest to read', () => {
    const at = (code: string) => DERRAMA_2025.byCode[code];
    // No derrama at all.
    expect(at('0813').generalRate).toBeNull(); // Silves
    expect(at('0801').generalRate).toBeNull(); // Albufeira
    expect(at('0808').generalRate).toBeNull(); // Loulé
    // A general rate whose "Taxa geral" label did not extract.
    expect(at('1406').generalRate).toBe(1.5); // Cartaxo
    expect(at('0701').generalRate).toBe(1.5); // Alandroal
    // At the very top of a page with no header row.
    expect(at('1013')).toMatchObject({ generalRate: 1.5, rules: [{ kind: 'reduced', rate: 0.1, turnoverMax: 150_000 }] });
    expect(at('1011')).toEqual({ generalRate: 1.5, rules: [] }); // Nazaré, just before it
    // Ordinary rows.
    expect(at('0805')).toMatchObject({ generalRate: 1.2, rules: [{ kind: 'exempt', turnoverMax: 150_000 }] }); // Faro
    expect(at('0912')).toMatchObject({ generalRate: 1, rules: [{ kind: 'reduced', rate: 0.01 }] }); // Seia
    expect(at('0910').rules).toEqual([expect.objectContaining({ kind: 'exempt', criterion: null })]); // Pinhel
    // A merged cell: two reduced rates under one criterion.
    expect(at('1112').rules.filter((r) => r.kind === 'reduced').map((r) => [r.rate, r.turnoverMax]))
      .toEqual([[0.55, 150_000], [0.35, 75_000]]);
  });

  it('reads a turnover limit only from a turnover-only condition', () => {
    const lisboa = DERRAMA_2025.byCode['1106'];
    expect(lisboa.rules[0].turnoverMax).toBe(150_000);
    // "up to €1.2M, for these CAE groups" is not a plain turnover test.
    const sector = lisboa.rules.find((r) => r.criterion === 'sector');
    expect(sector?.turnoverMax).toBeNull();
  });
});

describe('derramaTableFor', () => {
  it('uses the period’s own table when there is one', () => {
    expect(derramaTableFor(2025)).toMatchObject({ exact: true, table: { taxYear: 2025 } });
  });

  it('estimates a later year on the most recent table, and says so', () => {
    expect(derramaTableFor(2026)).toMatchObject({ exact: false, table: { taxYear: 2025 } });
  });
});

describe('resolveDerrama', () => {
  const base = { manualRate: 1.5, taxYear: 2025 };

  it('uses the typed rate until a council is chosen', () => {
    expect(resolveDerrama({ ...base, municipalityCode: null, choice: undefined, manualRate: 1.2 }))
      .toMatchObject({ rate: 1.2, source: 'manual' });
  });

  it('defaults to the council’s general rate', () => {
    expect(resolveDerrama({ ...base, municipalityCode: '0805', choice: undefined }))
      .toMatchObject({ rate: 1.2, source: 'general', tableYear: 2025, exactYear: true });
  });

  it('charges nothing where the council charges nothing, whatever was chosen', () => {
    for (const choice of ['general', ruleChoice(2025, 0)] as const) {
      expect(resolveDerrama({ ...base, municipalityCode: '0813', choice }))
        .toMatchObject({ rate: 0, source: 'none' });
    }
  });

  it('applies a chosen exemption as zero and a reduced rate as its rate', () => {
    expect(resolveDerrama({ ...base, municipalityCode: '0805', choice: ruleChoice(2025, 0) }))
      .toMatchObject({ rate: 0, source: 'rule' });
    expect(resolveDerrama({ ...base, municipalityCode: '0912', choice: ruleChoice(2025, 0) }))
      .toMatchObject({ rate: 0.01, source: 'rule' });
  });

  it('falls back to the general rate when the chosen rule belongs to another table', () => {
    expect(resolveDerrama({ ...base, municipalityCode: '0805', choice: ruleChoice(2024, 0) }))
      .toMatchObject({ rate: 1.2, source: 'general', choiceOutdated: true });
    expect(resolveDerrama({ ...base, municipalityCode: '0805', choice: ruleChoice(2025, 9) }))
      .toMatchObject({ rate: 1.2, source: 'general', choiceOutdated: true });
  });

  it('lets a typed rate win when the owner asks for it, within the ceiling', () => {
    expect(resolveDerrama({ ...base, municipalityCode: '0805', choice: 'manual', manualRate: 9 }))
      .toMatchObject({ rate: DERRAMA_MUNICIPAL_CEILING, source: 'manual' });
  });
});

describe('turnoverRuleMet', () => {
  const faro = DERRAMA_2025.byCode['0805'].rules[0];

  it('compares last year’s turnover with the limit', () => {
    expect(turnoverRuleMet(faro, 120_000)).toBe(true);
    expect(turnoverRuleMet(faro, 150_000)).toBe(true);
    expect(turnoverRuleMet(faro, 150_001)).toBe(false);
  });

  it('does not judge without a figure to judge by', () => {
    expect(turnoverRuleMet(faro, null)).toBeNull();
    expect(turnoverRuleMet(faro, 0)).toBeNull();
  });
});

describe('choices and lookups', () => {
  it('accepts only the shapes it can resolve', () => {
    expect(isDerramaChoice('general')).toBe(true);
    expect(isDerramaChoice('rule:2025:3')).toBe(true);
    expect(isDerramaChoice('rule:25:3')).toBe(false);
    expect(isDerramaChoice('1.5')).toBe(false);
  });

  it('finds a council by its code', () => {
    expect(findMunicipality('0813')).toMatchObject({ name: 'Silves', district: 'Faro' });
    expect(findMunicipality('9999')).toBeNull();
    expect(findMunicipality(null)).toBeNull();
  });
});
