import { it, expect } from 'vitest';
import { getTranslation } from '@/lib/translations';

const KEYS = [
  'nav.dashboard','nav.revenue','nav.costs','nav.analytics','nav.team',
  'nav.billing','nav.settings','nav.entry','nav.scan','nav.history',
  'nav.comparison','nav.goals','nav.report','nav.showDetails','nav.hideDetails',
  'nav.logTodayRevenue','nav.logCosts','nav.sectionMain','nav.sectionManage',
  'navbar.admin','navbar.dashboard',
];

it('every dashboard nav key resolves in both languages', () => {
  const missing: string[] = [];
  for (const k of KEYS) {
    for (const lang of ['pt','en'] as const) {
      const v = getTranslation(lang, k);
      // getTranslation returns the key itself when the lookup fails.
      if (!v || v === k) missing.push(`${lang}:${k}`);
    }
  }
  expect(missing).toEqual([]);
});

it('PT and EN actually differ where they should', () => {
  expect(getTranslation('pt','nav.revenue')).not.toBe(getTranslation('en','nav.revenue'));
  expect(getTranslation('pt','nav.settings')).not.toBe(getTranslation('en','nav.settings'));
});
