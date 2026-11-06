import { parseInvoiceQr } from '@/lib/pt-invoice-qr';

/**
 * Reads an invoice's QR off the original photograph, in the browser.
 *
 * The page the server receives has been cropped, filtered for contrast and
 * scaled down, which is the worst copy to look for a QR in: every one of those
 * steps can cost a code that was perfectly readable. So it is read here, from the
 * untouched picture, and only the text travels.
 *
 * The decoder is loaded on demand and served from our own origin: its default is
 * a public CDN, and photographing an invoice should not depend on one.
 */

let prepared = false;

/** The invoice QR's raw text, or null. Never throws: a failed read changes nothing. */
export async function readQrText(picture: HTMLCanvasElement): Promise<string | null> {
  try {
    const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader');
    if (!prepared) {
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? `/scanner/${path}` : prefix + path,
        },
      });
      prepared = true;
    }

    const context = picture.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    const pixels = context.getImageData(0, 0, picture.width, picture.height);
    const found = await readBarcodes(pixels, { formats: ['QRCode'], tryHarder: true });
    return found.find((code) => parseInvoiceQr(code.text))?.text ?? null;
  } catch {
    return null;
  }
}
