import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Catches Portuguese written straight into the markup.
 *
 * The parity test only proves the dictionary is balanced; it says nothing about
 * whether the code actually uses it. That gap is how the admin console stayed
 * Portuguese-only long after the dictionary was complete, and how the dashboard
 * accumulated ~200 baked-in strings before anyone noticed.
 *
 * Accented characters are the signal. It is deliberately narrow: it will not
 * catch "Clientes" or "Save", so it is a safety net rather than a guarantee.
 * A file that trips it should move its text into `lib/translations.ts` — not be
 * added to the exemptions below.
 */

const ROOTS = ['app', 'lib'];

/**
 * Places where Portuguese in the source is correct.
 *
 * Each entry needs a reason. "It was easier" is not one: the point of the list
 * is that it stays short enough to read.
 */
const ALLOWED = [
  // The dictionary itself is half Portuguese by definition.
  'lib/translations.ts',
  // Release notes are written for a Portuguese-speaking owner and are shown
  // as-is; they are content, not interface.
  'lib/changelog.ts',
  // Glossary and quote text, stored per language and selected at render.
  'lib/glossary.ts',
  'lib/welcome-quotes.ts',
  // Portuguese tax and accounting rules: the names are the legal terms.
  'lib/tax-rules.ts',
  'lib/tax-calc.ts',
  'lib/pnl.ts',
  'lib/compliance.ts',
  'lib/schedule.ts',
  'lib/categories.ts',
  'lib/category-rules.ts',
  'lib/menu-costing.ts',
  'lib/seed-categories.ts',
  // Legal text, published in Portuguese because that is the governing version.
  'app/privacy',
  'app/terms',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strips comments, so prose explaining a decision is not mistaken for UI. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ACCENTED = /[ãõçáàâéêíóôúÃÕÇÁÀÂÉÊÍÓÔÚ]/;

/** Visible text between JSX tags, and the arguments of toast/confirm/alert. */
function findHardcoded(src: string): string[] {
  const code = stripComments(src);
  const hits: string[] = [];

  for (const m of code.matchAll(/>([^<>{}\n]+)</g)) {
    const text = m[1].trim();
    if (text.length > 2 && ACCENTED.test(text)) hits.push(text);
  }

  for (const m of code.matchAll(/(?:toast\.\w+|confirm|alert)\(\s*'([^']{3,})'/g)) {
    if (ACCENTED.test(m[1])) hits.push(m[1]);
  }

  for (const m of code.matchAll(/(?:placeholder|aria-label|title)=\{?'([^']{3,})'/g)) {
    if (ACCENTED.test(m[1])) hits.push(m[1]);
  }

  return hits;
}

describe('no hardcoded Portuguese in the interface', () => {
  const files = ROOTS.flatMap((r) => walk(r)).filter(
    (f) => !ALLOWED.some((a) => f.replace(/\\/g, '/').includes(a)),
  );

  it('scans a meaningful number of files', () => {
    // Guards against the walk silently finding nothing and the suite passing
    // for the wrong reason.
    expect(files.length).toBeGreaterThan(50);
  });

  it('routes every visible string through the dictionary', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const hits = findHardcoded(readFileSync(file, 'utf8'));
      if (hits.length) {
        offenders.push(`${file.replace(/\\/g, '/')}: ${hits.slice(0, 3).join(' | ')}`);
      }
    }
    expect(
      offenders,
      `Hardcoded Portuguese found. Move it into lib/translations.ts:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
