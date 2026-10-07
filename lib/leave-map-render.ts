import React from 'react';
import sharp from 'sharp';
import { Document, Page, Image, renderToBuffer } from '@react-pdf/renderer';

/**
 * Turns the holiday map's SVG pages into what leaves the server: a PNG per
 * page for the preview, or one PDF for the printer.
 *
 * Both come from the same rasters, so the preview cannot disagree with the
 * print. The PDF carries each page at 300 dpi, which is print quality, as a
 * full-bleed image on an A4 landscape page.
 */

export const PREVIEW_SCALE = 2;
export const PRINT_SCALE = 300 / 96;

export function rasterisePage(svg: string, width: number, height: number, scale: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 72 * scale })
    .resize(Math.round(width * scale), Math.round(height * scale), { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function leaveMapPdf(
  pages: string[],
  size: { width: number; height: number },
  meta: { title: string; author?: string },
): Promise<Buffer> {
  const images = await Promise.all(
    pages.map((svg) => rasterisePage(svg, size.width, size.height, PRINT_SCALE)),
  );
  return renderToBuffer(
    React.createElement(
      Document,
      { title: meta.title, author: meta.author },
      ...images.map((data, i) =>
        React.createElement(
          Page,
          { key: i, size: 'A4', orientation: 'landscape', style: { padding: 0 } },
          React.createElement(Image, { src: { data, format: 'png' }, style: { width: '100%', height: '100%' } }),
        ),
      ),
    ),
  );
}
