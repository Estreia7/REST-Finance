// Part of the derrama import; see derrama-4-generate.mjs for the steps.
import { readFileSync, writeFileSync } from 'fs';
const items = JSON.parse(readFileSync('items.json', 'utf8'));
const pct = (s) => Number(s.replace('%', '').replace(',', '.').trim());
const isGeneral = (s) => /^taxa geral$/i.test(s.trim());
const munis = [];
const rows = [];
const warn = (...a) => console.log('WARN', ...a);
const pages = [...new Set(items.map((i) => i.p))].sort((a, b) => a - b);
for (const p of pages) {
  const HEADER = /^(CÓDIGO|MUNICÍPIO|TAXAS E ISENÇÕES|ÂMBITO|TABELA DE TAXAS)/;
  const pi = items.filter((i) => i.p === p && !HEADER.test(i.s.trim()) && !/^(Distrito de|Região)/i.test(i.s.trim()));
  const near = (y, lo, hi, d) => pi.filter((i) => i.x >= lo && i.x < hi && Math.abs(i.y - y) <= d);
  for (const c of pi.filter((i) => i.x < 35 && /^\d\d$/.test(i.s))) {
    const cc = near(c.y, 45, 60, 2)[0];
    munis.push({ p, y: c.y, code: `${c.s}${cc.s}`, name: near(c.y, 65, 190, 2).map((i) => i.s).join(' ').trim() });
  }
  const typeLabels = pi.filter((i) => i.x >= 190 && i.x < 215);
  const rateItems = pi.filter((i) => i.x >= 300 && i.x < 400 && /%/.test(i.s));
  const used = new Set();
  const pageRows = [];
  for (const g of typeLabels.filter((t) => isGeneral(t.s))) {
    const r = rateItems.filter((i) => Math.abs(i.y - g.y) <= 4);
    r.forEach((x) => used.add(x));
    if (r.length !== 1) warn('general rates', p, g.y, r.map((x) => x.s));
    pageRows.push({ p, y: g.y, general: true, rate: r[0] ? pct(r[0].s) : null });
  }
  for (const c of pi.filter((i) => i.x >= 260 && i.x < 305)) {
    const r = rateItems.filter((i) => !used.has(i) && Math.abs(i.y - c.y) <= 4);
    r.forEach((x) => used.add(x));
    pageRows.push({ p, y: c.y, general: false, crit: c.s, rates: r.map((x) => pct(x.s)) });
  }
  const critItems = pi.filter((i) => i.x >= 260 && i.x < 305);
  const muniYs = pi.filter((i) => i.x < 35 && /^\d\d$/.test(i.s)).map((i) => i.y);
  for (const r of rateItems.filter((i) => !used.has(i))) {
    // A lone rate on the municipality's own line, with no criterion beside
    // it, is a general rate whose "Taxa geral" label did not extract.
    const onMuniLine = muniYs.some((y) => Math.abs(y - r.y) <= 3);
    const hasCrit = critItems.some((c) => Math.abs(c.y - r.y) <= 4);
    const hasLabel = typeLabels.some((t) => Math.abs(t.y - r.y) <= 12);
    if (onMuniLine && !hasCrit && !hasLabel) {
      pageRows.push({ p, y: r.y, general: true, rate: pct(r.s), recovered: true });
      continue;
    }
    // Otherwise one of several rates in a merged cell: take the nearest criterion.
    const c = critItems.reduce((b, x) => (!b || Math.abs(x.y - r.y) < Math.abs(b.y - r.y) ? x : b), null);
    pageRows.push({ p, y: r.y, general: false, crit: c && Math.abs(c.y - r.y) < 30 ? c.s : '', rates: [pct(r.s)], orphan: true });
  }
  // type label for non-general rows: nearest non-general label
  const others = typeLabels.filter((t) => !isGeneral(t.s));
  const labelled = new Set();
  for (const r of pageRows.filter((r) => !r.general)) {
    const t = others.reduce((b, l) => (!b || Math.abs(l.y - r.y) < Math.abs(b.y - r.y) ? l : b), null);
    r.type = t ? t.s : '?';
    r.ambito = [];
    if (t) labelled.add(t);
  }
  // A reduction or exemption with no criterion at all ("sede social no
  // concelho") has only its label to stand on.
  for (const t of others.filter((l) => !labelled.has(l))) {
    const r = rateItems.filter((i) => !used.has(i) && Math.abs(i.y - t.y) <= 4);
    r.forEach((x) => used.add(x));
    pageRows.push({ p, y: t.y, general: false, crit: '', type: t.s, rates: r.map((x) => pct(x.s)), ambito: [] });
  }
  // ambito paragraphs
  const amb = pi.filter((i) => i.x >= 400).sort((a, b) => b.y - a.y);
  const paras = [];
  for (const a of amb) {
    const last = paras[paras.length - 1];
    const startsNew = /^Sujeitos passivos/i.test(a.s.trim());
    const endedSentence = last && /\.$/.test(last.text[last.text.length - 1].trim());
    if (!last || startsNew || endedSentence || last.bottom - a.y > 16) paras.push({ top: a.y, bottom: a.y, text: [a.s] });
    else { last.bottom = a.y; last.text.push(a.s); }
  }
  const nonGen = pageRows.filter((r) => !r.general);
  for (const para of paras) {
    const mid = (para.top + para.bottom) / 2;
    if (!nonGen.length) { warn('ambito without row', p, para.text.join(' ')); continue; }
    const best = nonGen.reduce((b, r) => (Math.abs(r.y - mid) < Math.abs(b.y - mid) ? r : b));
    best.ambito.push(para.text.join(' ').replace(/\s+/g, ' ').trim());
    best.top = Math.max(best.top ?? best.y, para.top);
    best.bottom = Math.min(best.bottom ?? best.y, para.bottom);
  }
  rows.push(...pageRows.sort((a, b) => b.y - a.y));
}
// blocks start at a general row
const blocks = [];
for (const r of rows) {
  if (r.general || !blocks.length) blocks.push([r]);
  else blocks[blocks.length - 1].push(r);
}
const pairs = [];
blocks.forEach((b, bi) => {
  const on = b.filter((r) => r.p === b[0].p);
  const top = Math.max(...on.map((r) => r.top ?? r.y));
  const bottom = Math.min(...on.map((r) => r.bottom ?? r.y));
  const mid = (top + bottom) / 2;
  munis.forEach((m, mi) => { if (m.p === b[0].p) pairs.push({ bi, mi, d: Math.abs(m.y - mid) }); });
});
pairs.sort((a, b) => a.d - b.d);
const bm = new Map(), mb = new Map();
for (const pr of pairs) {
  if (bm.has(pr.bi) || mb.has(pr.mi) || pr.d > 80) continue;
  bm.set(pr.bi, pr.mi); mb.set(pr.mi, pr.bi);
}
blocks.forEach((b, i) => { if (!bm.has(i)) warn('UNASSIGNED', b[0].p, b[0].y, JSON.stringify(b)); });
const out = munis.map((m, mi) => {
  const b = mb.has(mi) ? blocks[mb.get(mi)] : [];
  const g = b.find((r) => r.general);
  return {
    code: m.code, name: m.name, generalRate: g ? g.rate : 0,
    rules: b.filter((r) => !r.general).map((r) => ({
      type: r.type, criterion: r.crit, rates: r.rates, ambito: r.ambito.join(' '), orphan: !!r.orphan,
    })),
  };
});
writeFileSync('derrama2.json', JSON.stringify(out, null, 1));
console.log('munis', out.length, 'blocks', blocks.length, 'assigned', bm.size, 'none:', out.filter((m) => !m.generalRate).length);
const odd = out.flatMap((m) => m.rules.filter((r) => r.orphan || !r.criterion || r.rates.length > 1 || !r.ambito || r.type === '?').map((r) => `${m.code} ${m.name}: ${JSON.stringify(r)}`));
console.log('odd rows', odd.length); console.log(odd.join('\n'));
