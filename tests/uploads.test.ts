import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let storage: string;

beforeAll(() => {
  storage = mkdtempSync(path.join(tmpdir(), 'rf-uploads-'));
  process.env.STORAGE_DIR = storage;
});

afterAll(() => rmSync(storage, { recursive: true, force: true }));

/** Imported after STORAGE_DIR is set, since the module reads it at load. */
async function mod() {
  return import('@/lib/uploads');
}

function fileFrom(bytes: number[], name = 'x.png', type = 'image/png'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0];

describe('saveImage', () => {
  it('accepts a real PNG', async () => {
    const { saveImage } = await mod();
    const result = await saveImage('logos', 'rest-1', fileFrom(PNG));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe('png');
  });

  it('accepts JPEG and WebP', async () => {
    const { saveImage } = await mod();
    expect((await saveImage('logos', 'r1', fileFrom(JPEG))).ok).toBe(true);
    expect((await saveImage('logos', 'r1', fileFrom(WEBP))).ok).toBe(true);
  });

  it('rejects a script renamed to .png', async () => {
    // The whole point of sniffing: the declared type says image/png.
    const { saveImage } = await mod();
    const evil = new TextEncoder().encode('<?php system($_GET["c"]); ?>');
    const result = await saveImage('logos', 'r1', new File([evil], 'shell.png', { type: 'image/png' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an SVG, which can carry script', async () => {
    const { saveImage } = await mod();
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const result = await saveImage('logos', 'r1', new File([svg], 'a.svg', { type: 'image/svg+xml' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty file and one over the size cap', async () => {
    const { saveImage, MAX_IMAGE_BYTES } = await mod();
    expect((await saveImage('logos', 'r1', new File([], 'e.png'))).ok).toBe(false);

    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect((await saveImage('logos', 'r1', new File([big], 'big.png'))).ok).toBe(false);
  });

  it('rejects an owner id that could reach outside its directory', async () => {
    const { saveImage } = await mod();
    const result = await saveImage('logos', '../../etc', fileFrom(PNG));
    expect(result.ok).toBe(false);
  });

  it('never reuses the uploaded filename', async () => {
    const { saveImage } = await mod();
    const result = await saveImage('logos', 'r2', fileFrom(PNG, 'my logo (1).png'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storedPath).not.toContain('my logo');
      expect(result.storedPath).toMatch(/^logos\/r2\/[0-9a-f-]{36}\.png$/);
    }
  });
});

describe('resolveStoredPath', () => {
  it('resolves a normal path inside storage', async () => {
    const { resolveStoredPath } = await mod();
    expect(resolveStoredPath('logos/r1/a.png')).toContain('logos');
  });

  it('refuses traversal out of storage', async () => {
    const { resolveStoredPath } = await mod();
    expect(resolveStoredPath('../../../etc/passwd')).toBeNull();
    expect(resolveStoredPath('logos/../../../secret')).toBeNull();
  });
});

describe('deleteStoredImage', () => {
  it('removes a stored file and tolerates a missing one', async () => {
    const { saveImage, deleteStoredImage, resolveStoredPath } = await mod();
    const result = await saveImage('avatars', 'u1', fileFrom(PNG));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const abs = resolveStoredPath(result.storedPath)!;
    expect(existsSync(abs)).toBe(true);

    await deleteStoredImage(result.storedPath);
    expect(existsSync(abs)).toBe(false);

    // Deleting again must not throw.
    await expect(deleteStoredImage(result.storedPath)).resolves.toBeUndefined();
    await expect(deleteStoredImage(null)).resolves.toBeUndefined();
  });
});
