// Part of the derrama import; see derrama-4-generate.mjs for the steps.
import { readFileSync, writeFileSync } from 'fs';
import { renderPageAsImage } from 'unpdf';
const buf = new Uint8Array(readFileSync('derrama.pdf'));
for (const p of process.argv.slice(2).map(Number)) {
  const img = await renderPageAsImage(new Uint8Array(buf), p, { canvasImport: () => import('@napi-rs/canvas'), scale: 1.6 });
  writeFileSync(`page-${p}.png`, Buffer.from(img));
}
console.log('ok');
