import { describe, it, expect } from 'vitest';
import { MODULES, PLAN_MODULES, enabledModules, hasModule, isModuleKey } from '@/lib/modules';

describe('extra modules', () => {
  it('starts every restaurant with no extra module, whatever the plan', () => {
    for (const plan of ['TRIAL', 'MONTHLY', 'YEARLY'] as const) {
      expect(enabledModules({ plan, modules: [] })).toEqual([]);
    }
  });

  it('gives a restaurant what an administrator switched on, in registry order', () => {
    expect(enabledModules({ plan: 'MONTHLY', modules: ['timeClock', 'stock'] })).toEqual(['stock', 'timeClock']);
    expect(enabledModules({ plan: 'TRIAL', modules: ['timeClock'] })).toEqual(['timeClock']);
  });

  it('ignores a stored key that is no longer a module', () => {
    expect(enabledModules({ plan: 'YEARLY', modules: ['retired', 'stock'] })).toEqual(['stock']);
    expect(isModuleKey('retired')).toBe(false);
  });

  it('only lists real modules under each plan', () => {
    for (const keys of Object.values(PLAN_MODULES)) {
      for (const key of keys) expect(MODULES).toContain(key);
    }
  });

  it('answers no when the list has not loaded yet', () => {
    expect(hasModule(undefined, 'stock')).toBe(false);
    expect(hasModule(['stock'], 'stock')).toBe(true);
    expect(hasModule(['stock'], 'timeClock')).toBe(false);
  });
});
