/* KIE.ai image generation — a portable client.
 *
 * Copy this single file into any project. It has no imports beyond Node
 * itself and an optional `sharp`, and knows nothing about the project
 * using it: prompts, sizes and output paths all come from the caller.
 *
 * Everything here was probed against the live API, not taken from the
 * docs, which do not publish the generation endpoints at all.
 *
 *   import { generate, credit } from "./kie.mjs";
 *
 *   const { bytes, w, h } = await generate({
 *     prompt: "a lighthouse on a cliff at dusk",
 *     ratio: "3:2",
 *     file: "public/hero.webp",
 *   });
 *
 * Requires KIE_API_KEY in the environment or in .env.local.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API = "https://api.kie.ai/api/v1";

/** GPT Image 2.5 — 6 credits (~$0.03) at 1K, 10 at 2K, 16 at 4K.
 *  Override per call if your key authorises other models; a key scoped to
 *  one model rejects everything else. */
export const DEFAULT_MODEL = "gpt-image-2-5-flare-text-to-image";

/* ── key ─────────────────────────────────────────────────── */

let cachedKey = null;

/** Environment first, then .env.local — so CI can inject it without a
 *  file, and local runs need no shell setup. */
export async function readKey({ envFile = ".env.local", varName = "KIE_API_KEY" } = {}) {
  if (cachedKey) return cachedKey;
  if (process.env[varName]) return (cachedKey = process.env[varName].trim());
  try {
    const env = await readFile(path.join(process.cwd(), envFile), "utf8");
    const m = env.match(new RegExp(`^${varName}=(.+)$`, "m"));
    if (m) return (cachedKey = m[1].trim());
  } catch {
    /* no .env.local — fall through to the error below */
  }
  throw new Error(`${varName} not found in the environment or ${envFile}`);
}

async function api(pathname, { key, method = "GET", body } = {}) {
  const k = key ?? (await readKey());
  const r = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${k}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error(`${pathname}: HTTP ${r.status}, response was not JSON`);
  // The API answers 200 at the HTTP layer and puts the real status in
  // `code`, so checking r.ok alone would miss every failure.
  if (j.code !== 200) throw new Error(`${pathname}: code ${j.code} — ${j.msg}`);
  return j.data;
}

/* ── account ─────────────────────────────────────────────── */

/** Remaining credits. Useful as a preflight: a batch that runs out
 *  halfway leaves you with half a set and no clear error. */
export async function credit(key) {
  return api("/chat/credit", { key });
}

/** Every model on the marketplace. Filter by `taskType` to find the ones
 *  that do what you want — note your key may only authorise some. */
export async function models(key) {
  const d = await api("/models", { key });
  return d.models ?? [];
}

export async function textToImageModels(key) {
  return (await models(key)).filter((m) =>
    (m.taskType ?? []).some((t) => /text to image/i.test(t))
  );
}

/* ── generation ──────────────────────────────────────────── */

/**
 * Starts a generation and returns its task id.
 *
 * `aspect_ratio` is the field that controls shape. `image_size` is
 * ACCEPTED AND THEN IGNORED — asking for "3:2" through it returns a
 * square, with no error. Probed against the live API across five
 * spellings; only `aspect_ratio` worked.
 */
export async function createTask({ prompt, ratio = "1:1", model = DEFAULT_MODEL, input = {}, key }) {
  if (!prompt?.trim()) throw new Error("createTask needs a prompt");
  const d = await api("/jobs/createTask", {
    key,
    method: "POST",
    body: { model, input: { prompt, aspect_ratio: ratio, ...input } },
  });
  if (!d?.taskId) throw new Error("createTask returned no taskId");
  return d.taskId;
}

/**
 * Polls until the task settles, then returns the result URLs.
 *
 * Generation takes about a minute, so the interval is generous; the cap
 * stops a stuck task from hanging the caller forever. `resultJson` comes
 * back as a STRING of JSON, not an object.
 */
export async function waitForTask(taskId, { key, intervalMs = 5000, maxTries = 60, onTick } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const d = await api(`/jobs/recordInfo?taskId=${taskId}`, { key });
    onTick?.(d.state, i);
    if (d.state === "success") {
      const urls = JSON.parse(d.resultJson || "{}").resultUrls ?? [];
      if (!urls.length) throw new Error("task succeeded but returned no resultUrls");
      return { urls, costTime: d.costTime };
    }
    if (d.state === "fail") throw new Error(`task failed: ${d.failCode} ${d.failMsg}`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`task ${taskId} unsettled after ${(intervalMs * maxTries) / 1000}s`);
}

/* ── download ────────────────────────────────────────────── */

/** Width and height straight from the PNG's IHDR chunk (big-endian
 *  uint32 at byte 16 and 20), so the shape can be checked without
 *  decoding the image or pulling in a dependency. */
export function pngSize(buf) {
  if (!(buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG")) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Fetches the generated image and writes it to `file`.
 *
 * Two guards, both earned the hard way:
 *  - PNG magic bytes, because a truncated download or an error page would
 *    otherwise be written out as a plausible-looking file.
 *  - The returned dimensions against the ratio asked for, because the API
 *    once ignored the shape field without saying so.
 *
 * If `sharp` is installed and `width` is given, the file is written as
 * WebP at that width: the raw PNGs arrive around 2 MB each, which is fine
 * as a source and far too heavy for a page. Without sharp, the PNG is
 * written unchanged.
 */
export async function download(url, file, { ratio, width, quality = 80 } = {}) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());

  const size = pngSize(buf);
  if (!size) throw new Error(`not a PNG (${buf.length} bytes)`);

  if (ratio) {
    const [rw, rh] = ratio.split(":").map(Number);
    if (Math.abs(size.w / size.h - rw / rh) > 0.05) {
      throw new Error(`wrong ratio: asked ${ratio}, got ${size.w}x${size.h}`);
    }
  }

  await mkdir(path.dirname(file), { recursive: true });

  if (width && /\.webp$/i.test(file)) {
    const sharp = await loadSharp();
    if (sharp) {
      const out = await sharp(buf)
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      await writeFile(file, out);
      const m = await sharp(out).metadata();
      return { bytes: out.length, w: m.width, h: m.height, converted: true };
    }
    // No sharp: better to write a working PNG beside the intended name
    // than to fail, but say so rather than pretending it is a WebP.
    const png = file.replace(/\.webp$/i, ".png");
    await writeFile(png, buf);
    return { bytes: buf.length, ...size, converted: false, file: png };
  }

  await writeFile(file, buf);
  return { bytes: buf.length, ...size, converted: false };
}

/** Optional dependency: resolved at call time so the module works in a
 *  project that has no image tooling. */
async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/* ── one-shot ────────────────────────────────────────────── */

/**
 * Prompt in, file on disk out. The whole flow: create, poll, verify,
 * write.
 *
 * `style` is a preamble prepended to the prompt. Use the same one across
 * a set and the images read as one commission rather than several — it
 * does more for coherence than any per-image wording.
 */
export async function generate({
  prompt,
  file,
  ratio = "1:1",
  width,
  style = "",
  model = DEFAULT_MODEL,
  input,
  key,
  quality,
  onTick,
}) {
  const full = style ? `${style} ${prompt}` : prompt;
  const taskId = await createTask({ prompt: full, ratio, model, input, key });
  const { urls, costTime } = await waitForTask(taskId, { key, onTick });
  const out = await download(urls[0], file, { ratio, width, quality });
  return { ...out, costTime, taskId, url: urls[0] };
}

/**
 * Generates a set, one at a time, skipping what already exists.
 *
 * Sequential on purpose: generation is the slow part, the account has a
 * concurrency limit, and a failure halfway through a parallel batch is
 * far harder to reason about than one in a queue. Each item is
 * `{ slug, prompt, ratio?, width? }`; the file path comes from `outDir`
 * and the slug.
 */
export async function generateSet(items, { outDir, style = "", ext = "webp", force = false, defaultWidth = 1200, model, key, onLog = console.log } = {}) {
  const { access } = await import("node:fs/promises");
  const exists = (p) => access(p).then(() => true, () => false);

  let done = 0;
  let failed = 0;
  const results = [];

  for (const item of items) {
    const file = path.join(outDir, `${item.slug}.${ext}`);
    if (!force && (await exists(file))) {
      onLog(`↷ ${item.slug} already exists (--force to redo)`);
      continue;
    }
    try {
      const r = await generate({
        prompt: item.prompt,
        file,
        ratio: item.ratio ?? "1:1",
        width: item.width ?? defaultWidth,
        style,
        model,
        key,
      });
      onLog(`✓ ${item.slug} — ${r.w}x${r.h}, ${Math.round(r.bytes / 1024)}KB in ${r.costTime}s`);
      results.push({ slug: item.slug, ...r });
      done++;
    } catch (e) {
      onLog(`✗ ${item.slug} — ${e.message}`);
      failed++;
    }
  }

  onLog(`\n${done} generated, ${failed} failed. ~${done * 6} credits at 1K.`);
  return { done, failed, results };
}
