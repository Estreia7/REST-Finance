import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards the default categories every new restaurant receives.
 *
 * Prime Cost is COGS plus labour, so a wage category that is not flagged
 * contributes nothing and the metric silently halves. This asserts the
 * defaults keep their flags rather than relying on someone noticing.
 */
const source = readFileSync('app/dashboard/actions.ts', 'utf8');

describe('default OPEX categories', () => {
  const block = source.slice(
    source.indexOf('const DEFAULT_OPEX_CATEGORIES'),
    source.indexOf('async function initializeDefaultCategories')
  );

  it('flags wages as labour', () => {
    expect(block).toMatch(/\{ name: 'Ordenados', isLabour: true \}/);
  });

  it('flags social security as labour', () => {
    expect(block).toMatch(/\{ name: 'Segurança Social', isLabour: true \}/);
  });

  it('does not flag rent or utilities as labour', () => {
    for (const name of ['Renda', 'Luz', 'Água', 'Marketing']) {
      const entry = new RegExp(`\{ name: '${name}'[^}]*\}`);
      const match = block.match(entry);
      expect(match, `${name} should be present`).toBeTruthy();
      expect(match![0], `${name} must not be labour`).not.toContain('isLabour: true');
    }
  });

  it('creates categories in one statement rather than a loop', () => {
    // 22 sequential inserts on first dashboard load was measurably slow.
    expect(source).toContain('prisma.category.createMany');
  });
});
