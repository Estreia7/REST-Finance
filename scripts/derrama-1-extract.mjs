// Part of the derrama import; see derrama-4-generate.mjs for the steps.
import { readFileSync, writeFileSync } from 'fs';
import { getDocumentProxy } from 'unpdf';
const pdf = await getDocumentProxy(new Uint8Array(readFileSync('derrama.pdf')));
const out = [];
for (let p = 2; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    out.push({ p, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s: it.str });
  }
}
writeFileSync('items.json', JSON.stringify(out));
console.log(out.length);
