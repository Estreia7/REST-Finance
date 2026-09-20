import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Image uploads (restaurant logo, profile picture).
 *
 * Files are written under a storage directory outside the web root and served
 * through an authenticated route, so an upload cannot be reached by guessing a
 * URL. The stored name is random: the original is never used, because a
 * filename is attacker-controlled and path traversal lives there.
 *
 * The declared MIME type is not trusted. Every upload is checked against its
 * magic bytes, so renaming a script to .png does not get it accepted.
 */

const STORAGE_ROOT = process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage');

/** 2 MB. A logo or avatar never legitimately needs more. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type ImageKind = 'png' | 'jpeg' | 'webp';
export type DocKind = ImageKind | 'pdf';

/**
 * Identifies an image from its leading bytes.
 * Returns null for anything that is not one of the accepted formats.
 */
function sniffImage(bytes: Uint8Array): ImageKind | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

export const IMAGE_MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const DOC_MIME: Record<DocKind, string> = {
  ...IMAGE_MIME,
  pdf: 'application/pdf',
};

/** 10 MB. A scanned licence or policy can legitimately be larger than a logo. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/**
 * Identifies a compliance document: the image formats plus PDF.
 *
 * A PDF starts with "%PDF-". Checking it means a renamed executable or an
 * HTML file with a script in it cannot be stored and later served back.
 */
function sniffDocument(bytes: Uint8Array): DocKind | null {
  if (
    bytes.length > 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d
  ) {
    return 'pdf';
  }
  return sniffImage(bytes);
}

export type SaveDocResult =
  | { ok: true; storedPath: string; kind: DocKind; sizeBytes: number }
  | { ok: false; error: string };

/**
 * Writes a compliance document. Same guarantees as saveImage: random stored
 * name, content checked against magic bytes, confined to the owner's folder.
 */
export async function saveDocument(
  ownerId: string,
  file: File
): Promise<SaveDocResult> {
  if (file.size === 0) return { ok: false, error: 'O ficheiro está vazio.' };
  if (file.size > MAX_DOC_BYTES) {
    return { ok: false, error: 'O documento não pode exceder 10 MB.' };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocument(bytes);

  if (!kind) {
    return { ok: false, error: 'Formato inválido. Usa PDF, PNG, JPG ou WebP.' };
  }

  if (!/^[a-zA-Z0-9-]{1,64}$/.test(ownerId)) {
    return { ok: false, error: 'Identificador inválido.' };
  }

  const dir = path.join(STORAGE_ROOT, 'compliance', ownerId);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${kind}`;
  await writeFile(path.join(dir, filename), bytes);

  return {
    ok: true,
    storedPath: path.posix.join('compliance', ownerId, filename),
    kind,
    sizeBytes: file.size,
  };
}

export type SaveResult =
  | { ok: true; storedPath: string; kind: ImageKind }
  | { ok: false; error: string };

/**
 * Writes an uploaded image and returns the path to record.
 *
 * @param scope  Subdirectory, e.g. 'logos' or 'avatars'.
 * @param ownerId  Restaurant or user id, so files are grouped and a delete
 *                 cannot reach outside the owner's own directory.
 */
export async function saveImage(
  scope: 'logos' | 'avatars' | 'extraction-tests',
  ownerId: string,
  file: File
): Promise<SaveResult> {
  if (file.size === 0) return { ok: false, error: 'O ficheiro está vazio.' };
  // A photographed invoice is much larger than an avatar — a phone camera
  // frame at full resolution runs to several megabytes — and downscaling it
  // before the reader has seen it would throw away the detail the extraction
  // depends on.
  const limit = scope === 'extraction-tests' ? MAX_DOC_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      error: `A imagem não pode exceder ${Math.round(limit / (1024 * 1024))} MB.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);

  if (!kind) {
    return { ok: false, error: 'Formato inválido. Usa PNG, JPG ou WebP.' };
  }

  // ownerId comes from the session, never from the client, but validating the
  // shape keeps a malformed value from ever reaching a path.
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(ownerId)) {
    return { ok: false, error: 'Identificador inválido.' };
  }

  const dir = path.join(STORAGE_ROOT, scope, ownerId);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${kind}`;
  await writeFile(path.join(dir, filename), bytes);

  // Relative, so the record stays valid if the storage root ever moves.
  return { ok: true, storedPath: path.posix.join(scope, ownerId, filename), kind };
}

/** Absolute path for a stored file, or null if the value escapes storage. */
export function resolveStoredPath(storedPath: string): string | null {
  const resolved = path.resolve(STORAGE_ROOT, storedPath);
  const root = path.resolve(STORAGE_ROOT);

  // Refuses "../" traversal even though stored paths are generated by us:
  // the check costs nothing and the failure mode is reading arbitrary files.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** Best-effort delete, used when replacing an image. */
export async function deleteStoredImage(storedPath: string | null): Promise<void> {
  if (!storedPath) return;
  const resolved = resolveStoredPath(storedPath);
  if (!resolved) return;

  try {
    await unlink(resolved);
  } catch {
    // Already gone, or never written. Not worth failing an upload over.
  }
}

/** Extension of a stored path, for choosing a Content-Type when serving. */
export function kindFromPath(storedPath: string): DocKind | null {
  const ext = path.extname(storedPath).slice(1).toLowerCase();
  return ext === 'png' || ext === 'jpeg' || ext === 'webp' || ext === 'pdf' ? ext : null;
}
