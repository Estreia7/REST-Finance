// Part of the derrama import; see derrama-4-generate.mjs for the steps.
import { readFileSync, writeFileSync } from 'fs';
const raw = JSON.parse(readFileSync('derrama2.json', 'utf8'));
const items = JSON.parse(readFileSync('items.json', 'utf8'));
// district per municipality, from the "Distrito de X" headers in reading order
const heads = items.filter((i) => /^Distrito de /.test(i.s.trim())).map((i) => ({ p: i.p, y: i.y, d: i.s.trim().replace(/^Distrito de /, '') })).sort((a, b) => (a.p * 10000 - a.y) - (b.p * 10000 - b.y));
const codeItems = items.filter((i) => i.x < 35 && /^\d\d$/.test(i.s));
const order = (a) => a.p * 10000 - a.y;
const out = raw.map((m) => {
  const ci = codeItems.find((c) => c.s === m.code.slice(0, 2) && items.some((i) => i.p === c.p && i.x >= 45 && i.x < 60 && Math.abs(i.y - c.y) <= 2 && i.s === m.code.slice(2)));
  const head = heads.filter((h) => order(h) < order(ci)).pop();
  const rules = m.rules
    .filter((r) => !(r.rates.length === 0 && !r.ambito && /reduz/i.test(r.type))) // merged-cell label rows
    .map((r) => ({
      kind: r.rates.length > 0 ? 'reduced' : 'exempt',
      rate: r.rates[0] ?? 0,
      criterion: r.criterion,
      scope: r.ambito,
    }));
  return { code: m.code, name: m.name, district: head ? head.d : '?', generalRate: m.generalRate || null, rules };
});
writeFileSync('derrama-final.json', JSON.stringify(out, null, 1));
console.log(out.length, 'districts', [...new Set(out.map((m) => m.district))].length, 'rules', out.reduce((s, m) => s + m.rules.length, 0));
// compact per-page listing for verifiers
const lines = out.map((m) => `${m.code} ${m.name} [${m.district}] geral=${m.generalRate ?? 'SEM DERRAMA'}` + m.rules.map((r) => `\n    - ${r.kind === 'exempt' ? 'ISENÇÃO' : 'REDUZIDA ' + r.rate + '%'} | ${r.criterion || '(sem critério)'} | ${r.scope.slice(0, 160)}${r.scope.length > 160 ? '…' : ''}`).join(''));
writeFileSync('derrama-review.txt', lines.join('\n'));
