import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolveStoredPath } from '@/lib/uploads';

/**
 * The restaurant's logo, ready to embed in an SVG we rasterise: a square PNG
 * on white, as a data URI.
 *
 * Read from disk, like the PDF report does, because the rasteriser cannot
 * fetch the authenticated image route. Null on anything at all — a missing or
 * unreadable logo must never stop a rota or a holiday map from being made.
 */
export async function logoDataUri(
  logoPath: string | null | undefined,
  size = 128,
): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const absolute = resolveStoredPath(logoPath);
    if (!absolute) return null;
    const png = await sharp(await readFile(absolute))
      .resize(size, size, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}
