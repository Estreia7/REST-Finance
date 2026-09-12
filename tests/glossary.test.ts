import { it, expect } from 'vitest';
import { glossary, glossaryText, type GlossaryKey } from '@/lib/glossary';
import { getTranslation } from '@/lib/translations';

/**
 * The glossary is the one place where a missing entry is invisible: a tooltip
 * with no text still renders, just empty. So the tests check for presence and
 * for the qualities that make an explanation worth having.
 */

const KEYS: GlossaryKey[] = [
  'revenue', 'dineIn', 'takeaway',
  'cogs', 'cogsPct', 'opex', 'opexPct',
  'grossProfit', 'grossMargin', 'netIncome', 'netMargin',
  'pnlStatement', 'primeCost', 'labour', 'controllableIncome', 'occupancy',
  'pctOfRevenue',
  'costs', 'margin', 'monthlyAvg', 'revenueVsPrev', 'profitVsPrev',
  'avgTicket', 'avgTicketDineIn', 'avgTicketTakeaway', 'totalTickets',
  'target', 'progress', 'dailyPace', 'dailyNeeded', 'projectedMonthly', 'remaining',
  'trendBadge', 'sparkline',
  'priceAlert', 'priceThreshold', 'unitPrice', 'monthlyReport',
];

it('every term is defined in both languages', () => {
  const missing: string[] = [];
  for (const key of KEYS) {
    for (const lang of ['pt', 'en'] as const) {
      const entry = glossary(key, lang);
      if (!entry?.term || !entry?.plain) missing.push(`${lang}:${key}`);
    }
  }
  expect(missing).toEqual([]);
});

it('PT and EN are actually translated, not copied', () => {
  // A handful where the two languages must genuinely differ. Terms like
  // "Takeaway" and "COGS" are the same word in both, so they are not checked.
  for (const key of ['revenue', 'grossProfit', 'netIncome', 'labour'] as GlossaryKey[]) {
    expect(glossary(key, 'pt').plain).not.toBe(glossary(key, 'en').plain);
  }
});

it('an acronym is always spelled out before it is explained', () => {
  // The whole point of the tooltip on COGS is the expansion. If it were
  // dropped, the definition would still render and the loss would be silent.
  for (const key of ['cogs', 'opex', 'cogsPct', 'opexPct', 'pctOfRevenue'] as GlossaryKey[]) {
    for (const lang of ['pt', 'en'] as const) {
      expect(glossary(key, lang).expansion, `${lang}:${key}`).toBeTruthy();
      expect(glossaryText(key, lang)).toContain(glossary(key, lang).expansion!);
    }
  }
});

it('no definition leans on the jargon it is there to replace', () => {
  // "Lucro bruto é a receita menos o COGS" is circular for the person who
  // opened the tooltip because they did not know what COGS meant.
  const jargon = [/\bCOGS\b/, /\bOPEX\b/, /\bEBITDA\b/, /\bP&L\b/];
  const offenders: string[] = [];

  for (const key of KEYS) {
    for (const lang of ['pt', 'en'] as const) {
      const { plain } = glossary(key, lang);
      // The entry for an acronym may of course name itself.
      if (key.startsWith('cogs') || key.startsWith('opex')) continue;
      if (jargon.some(rx => rx.test(plain))) offenders.push(`${lang}:${key}`);
    }
  }

  expect(offenders).toEqual([]);
});

it('explanations are substantial enough to actually explain', () => {
  // A three-word gloss is the failure mode this whole feature exists to avoid:
  // "COGS: cost of goods" tells an owner nothing new.
  for (const key of KEYS) {
    for (const lang of ['pt', 'en'] as const) {
      expect(glossary(key, lang).plain.length, `${lang}:${key}`).toBeGreaterThan(40);
    }
  }
});

it('chart subtitles resolve in both languages', () => {
  const subtitles = [
    'charts.subAvgTicket',
    'charts.subMonthlyComparison',
    'charts.subMonthlyDetail',
    'charts.subRevenueByChannel',
    'charts.subSalesChannel',
  ];

  const missing: string[] = [];
  for (const k of subtitles) {
    for (const lang of ['pt', 'en'] as const) {
      const v = getTranslation(lang, k);
      // getTranslation returns the key itself when the lookup fails.
      if (!v || v === k) missing.push(`${lang}:${k}`);
    }
  }
  expect(missing).toEqual([]);
});
