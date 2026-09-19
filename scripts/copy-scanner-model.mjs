/**
 * Copies the document-detection model into `public/` before a build.
 *
 * The model is served from our own origin rather than the library's default
 * CDN: an owner photographing invoices should not depend on a third party
 * being reachable, and it keeps what the app fetches inside our own domain.
 *
 * Copied at build time instead of being committed, because these are ~3.4MB of
 * binaries that npm already versions for us. `postinstall` and `build` both run
 * it so a fresh checkout and a deploy both end up with the files present.
 */

import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Copies matching files, skipping ones already in place at the same size. */
function copyInto(from, to, pattern) {
  if (!existsSync(from)) return null;
  mkdirSync(to, { recursive: true });

  let copied = 0;
  for (const name of readdirSync(from)) {
    if (!pattern.test(name)) continue;
    const src = join(from, name);
    const dest = join(to, name);
    // A rebuild should not rewrite megabytes for nothing.
    if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
    copyFileSync(src, dest);
    copied++;
  }
  return copied;
}

// 1. The model and its ONNX runtime, served from our own origin rather than
//    the library's default CDN.
const model = copyInto(
  join(root, 'node_modules', 'scanic-ml', 'dist'),
  join(root, 'public', 'scanner'),
  /\.(ort|wasm|mjs)$/,
);

if (model === null) {
  // Not an error: the app falls back to the classical detector, which needs
  // nothing extra. Failing the build here would block a deploy over an
  // accuracy improvement.
  console.log('[scanner] scanic-ml not installed; skipping model copy');
} else {
  console.log(`[scanner] model ready in public/scanner (${model} file(s))`);
}

/*
 * 2. scanic's own optional chunks.
 *
 * `scanic.js` reaches its ML detector with a relative `import()` marked
 * `webpackIgnore`, deliberately leaving the file for the application to serve.
 * The bundler therefore never emits it, and the request resolves next to the
 * loading chunk — so the files have to sit in the chunks directory, or the ML
 * detector silently never loads and the classical one is used instead.
 *
 * `.next` only exists once a build has run, so during `postinstall` this is
 * simply skipped; the `build` script runs it again afterwards.
 */
const chunks = join(root, '.next', 'static', 'chunks');
if (existsSync(chunks)) {
  const optional = copyInto(
    join(root, 'node_modules', 'scanic', 'dist'),
    chunks,
    /^scanic-(mlDetector|ort\.wasm\.min)\.js$/,
  );
  console.log(`[scanner] detector chunks ready (${optional} file(s))`);
}
