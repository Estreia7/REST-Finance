/**
 * Step 4 of 4: writes lib/municipalities.ts and lib/derrama-2025.ts.
 *
 * Importing a year's derrama table from the Tax Authority's circular (PDF):
 *   1. derrama-1-extract.mjs  — every text item with its position → items.json
 *   2. derrama-2-parse.mjs    — rows rebuilt from positions → derrama2.json
 *   3. derrama-3-assemble.mjs — districts, rule kinds → derrama-final.json
 *   4. this file              — corrections, then the TypeScript sources
 * Run them in a scratch folder holding the PDF as derrama.pdf, after
 * `npm i unpdf @napi-rs/canvas` there. Then render the pages with
 * derrama-render-pages.mjs and check every row against them: merged cells
 * and labels that do not extract are why CORRECTIONS exists. The corrections
 * below are the 2025 table's; a new year's table needs its own check.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
const data = JSON.parse(readFileSync('derrama-final.json', 'utf8')).sort((a, b) => a.code.localeCompare(b.code));
const ROOT = fileURLToPath(new URL('../lib/', import.meta.url));

const VN150 = 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 150.000,00.';
const scopeStarting = (m, start) => {
  for (const r of m.rules) {
    const i = r.scope.indexOf(start);
    if (i >= 0) return r.scope.slice(i);
  }
  throw new Error(`${m.code}: no scope starting "${start}"`);
};

// Corrections found by checking every page image against the extraction.
// Merged cells in the circular where one criterion covers several rows: each
// row is an alternative condition, so each becomes its own rule.
const CORRECTIONS = {
  // The last line of Torre de Moncorvo's scope was read into Mogadouro's.
  '0408': (m) => { m.rules.forEach((r) => { r.scope = r.scope.replace(/\s*CAE - Grupo: 071; 072; 351 e 641$/, ''); }); },
  '1109': (m) => {
    const superior = scopeStarting(m, 'Sujeitos passivos cujo volume de negócios, no período anterior, seja superior');
    const div72 = scopeStarting(m, 'CAE - Divisão 72 e 74');
    const grupo551 = scopeStarting(m, 'CAE - Grupo 551').replace(/\s*Todas as empresas.*$/, '');
    const sede = scopeStarting(m, 'Todas as empresas que fixem');
    m.rules = [
      { kind: 'exempt', rate: 0, criterion: 'Volume negócios', scope: VN150 },
      { kind: 'exempt', rate: 0, criterion: 'Setor atividade', scope: superior },
      { kind: 'exempt', rate: 0, criterion: 'Setor atividade', scope: div72 },
      { kind: 'exempt', rate: 0, criterion: 'Setor atividade', scope: grupo551 },
      { kind: 'exempt', rate: 0, criterion: 'Criação emprego', scope: sede },
    ];
  },
  '1112': (m) => {
    const grupo551 = 'Sujeitos passivos CAE - grupo 551 que fixem atividade Concelho.';
    const sede = scopeStarting(m, 'Todas empresas fixem sede').replace(/\s*Sujeitos passivos CAE - Divisão.*$/, '');
    const div72 = scopeStarting(m, 'Sujeitos passivos CAE - Divisão 72 e 74');
    m.rules = [
      { kind: 'reduced', rate: 0.55, criterion: 'Volume negócios', scope: VN150 },
      { kind: 'reduced', rate: 0.35, criterion: 'Volume negócios', scope: 'Sujeitos passivos cujo volume de negócios, no período anterior, não ultrapasse € 75.000,00.' },
      { kind: 'exempt', rate: 0, criterion: 'Outras isenções', scope: grupo551 },
      { kind: 'exempt', rate: 0, criterion: 'Outras isenções', scope: sede },
      { kind: 'exempt', rate: 0, criterion: 'Outras isenções', scope: div72 },
    ];
  },
  // One "Criação emprego" cell spans the three reduced rates.
  '1307': (m) => { m.rules.forEach((r) => { if (r.kind === 'reduced') r.criterion = 'Criação emprego'; }); },
};
for (const [code, fix] of Object.entries(CORRECTIONS)) fix(data.find((m) => m.code === code));

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);
const title = (s) => s.toLowerCase().split(/(\s+|-|\()/).map((w, i) => {
  if (!w.trim() || w === '-' || w === '(') return w;
  if (i > 0 && SMALL.has(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}).join('');
const crit = (c) => !c ? null : /volume/i.test(c) ? 'turnover' : /emprego/i.test(c) ? 'jobs' : /setor/i.test(c) ? 'sector' : 'other';
const TURNOVER = /^Sujeitos passivos cujo volume de neg[óo]cios,? no per[íi]odo anterior,? n[ãa]o ultrapasse € ?([\d.]+),(\d{2})\.?$/i;
const turnoverMax = (scope) => {
  const m = scope.trim().match(TURNOVER);
  return m ? Number(m[1].replace(/\./g, '') + '.' + m[2]) : null;
};

const munis = data.map((m) => ({ code: m.code, name: title(m.name), district: title(m.district) }));
const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

writeFileSync(ROOT + 'municipalities.ts', `/**
 * Portugal's 308 municipalities, with the Tax Authority's district/council
 * code (the "DT/CC" used on the Modelo 22). Generated from the derrama
 * circular, which lists every one of them; the names are the circular's,
 * in normal case.
 *
 * Kept apart from the rates so the search box in the settings can load the
 * names without the tax tables.
 */

export interface Municipality {
  /** District + council, e.g. "0813" for Silves. */
  code: string;
  name: string;
  district: string;
}

export const MUNICIPALITIES: Municipality[] = [
${munis.map((m) => `  { code: ${q(m.code)}, name: ${q(m.name)}, district: ${q(m.district)} },`).join('\n')}
];
`);

const entries = data.map((m) => {
  const rules = m.rules.map((r) => `{ kind: ${q(r.kind)}, rate: ${r.rate}, criterion: ${crit(r.criterion) ? q(crit(r.criterion)) : 'null'}, turnoverMax: ${turnoverMax(r.scope)}, scope: ${q(r.scope)} }`);
  return `    ${q(m.code)}: { generalRate: ${m.generalRate ?? 'null'}, rules: [${rules.length ? '\n      ' + rules.join(',\n      ') + ',\n    ' : ''}] },`;
});
writeFileSync(ROOT + 'derrama-2025.ts', `/**
 * Derrama municipal for the 2025 tax period, as published by the Tax
 * Authority in Ofício Circulado 20288 of 2026-02-02 (DSIRC). Generated from
 * the circular's table and checked against it page by page; do not edit by
 * hand — regenerate when a correction is published, and add the next
 * period's table as its own file.
 *
 * Rates are percentages of taxable profit. A null general rate means the
 * council charges no derrama for the period. Scope texts are the circular's
 * own words, kept in Portuguese because they are the legal condition.
 */

import type { DerramaTable } from './derrama';

export const DERRAMA_2025: DerramaTable = {
  taxYear: 2025,
  source: 'Ofício Circulado 20288/2026 (AT), 2026-02-02',
  byCode: {
${entries.join('\n')}
  },
};
`);
const allRules = data.flatMap((m) => m.rules);
console.log('munis', munis.length, 'rules', allRules.length, 'turnover-only', allRules.filter((r) => turnoverMax(r.scope) !== null).length);
console.log('by criterion', JSON.stringify(allRules.reduce((a, r) => { const k = crit(r.criterion); a[k] = (a[k] || 0) + 1; return a; }, {})));
console.log('thresholds', [...new Set(allRules.map((r) => turnoverMax(r.scope)).filter((x) => x !== null))]);
console.log('no derrama', data.filter((m) => m.generalRate === null).length);
for (const c of ['0813', '0816', '1011', '1013', '0805']) console.log(JSON.stringify(munis.find((m) => m.code === c)), JSON.stringify(data.find((m) => m.code === c).generalRate), data.find((m) => m.code === c).rules.length);
