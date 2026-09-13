import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, TOUR_VERSION } from '@/lib/tour';
import { getTranslation } from '@/lib/translations';

/**
 * The walkthrough is the first thing a new client sees, and it is edited
 * whenever a feature lands. These are the mistakes that would otherwise ship
 * silently: a step added in one language, a step pointing at nothing, or the
 * tour quietly growing until nobody finishes it.
 */
describe('walkthrough', () => {
  it('has copy in both languages for every step', () => {
    const missing: string[] = [];
    for (const step of TOUR_STEPS) {
      for (const key of [step.titleKey, step.bodyKey]) {
        for (const lang of ['pt', 'en'] as const) {
          // getTranslation echoes the key back when it knows nothing about it.
          if (getTranslation(lang, key) === key) missing.push(`${lang}:${key}`);
        }
      }
    }
    expect(missing, `Missing tour copy: ${missing.join(', ')}`).toEqual([]);
  });

  it('says something different in each language', () => {
    // A step copied from pt to en without translating would pass the check
    // above. Titles are short enough that a genuine collision is unlikely.
    const same = TOUR_STEPS.filter(
      (s) => getTranslation('pt', s.bodyKey) === getTranslation('en', s.bodyKey),
    ).map((s) => s.bodyKey);
    expect(same, `Untranslated tour copy: ${same.join(', ')}`).toEqual([]);
  });

  it('stays short enough to be finished', () => {
    // See CLAUDE.md: this runs when patience is lowest. If this fails, drop a
    // step rather than raising the limit.
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(8);
  });

  it('starts and ends without an anchor', () => {
    // The first and last steps are centred: there is nothing to point at when
    // welcoming someone, and the closing step should not leave a control
    // highlighted behind it.
    expect(TOUR_STEPS[0].anchor).toBeUndefined();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].anchor).toBeUndefined();
  });

  it('gives every anchored step a tab to navigate to', () => {
    // Without this the tour would look for an anchor on whatever tab happens
    // to be open, and skip the step whenever it is not the right one.
    const stranded = TOUR_STEPS.filter((s) => s.anchor && !s.tab).map((s) => s.anchor);
    expect(stranded, `Anchored steps with no tab: ${stranded.join(', ')}`).toEqual([]);
  });

  it('has a version to compare against', () => {
    expect(Number.isInteger(TOUR_VERSION)).toBe(true);
    expect(TOUR_VERSION).toBeGreaterThan(0);
  });
});
