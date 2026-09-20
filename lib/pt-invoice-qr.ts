/**
 * Reading the QR code printed on a Portuguese certified invoice.
 *
 * Since 2023 every fatura produced by certified software carries a QR holding
 * the fields the tax authority cares about, as plain text. That is the single
 * most useful thing on the page: where a model reading the printed characters
 * can misread a 3 as an 8, the QR either decodes exactly or does not decode at
 * all. There is no confident-but-wrong.
 *
 * So the QR is not a better extractor — it is ground truth. When it is
 * present and legible, the supplier's NIF, the date, the document number and
 * the total are known, and the model is only needed for what the QR does not
 * carry: the supplier's name and the line items.
 *
 * Format (Portaria 195/2020): asterisk-separated `KEY:value` pairs, e.g.
 *   A:515194077*B:999999990*C:PT*D:FR*E:N*F:20260903*G:FR 0005/267376*...
 *
 * The field table is written out here from the specification rather than
 * taken from a library: the only TypeScript implementation in the wild has no
 * adoption and is not on npm, and the parsing itself is a few lines. What is
 * worth getting right is which letter means what.
 */

/** One field of the QR, as the specification names it. */
export const QR_FIELDS = {
  A: 'issuerNif',
  B: 'buyerNif',
  C: 'buyerCountry',
  D: 'documentType',
  E: 'documentStatus',
  F: 'date',
  G: 'documentNumber',
  H: 'atcud',
  /** I1 names the tax region; I2..I8 are mainland bases and amounts. */
  I1: 'taxRegion',
  N: 'totalTaxes',
  O: 'grandTotal',
  Q: 'hash',
  R: 'certificateNumber',
} as const;

/**
 * Document types that are an invoice for our purposes.
 *
 * FT fatura, FS fatura simplificada, FR fatura-recibo, ND nota de débito.
 * NC (nota de crédito) is deliberately absent: a credit note is money coming
 * back and recording it as a cost would be wrong in a way that quietly
 * overstates what the restaurant spent.
 */
const INVOICE_TYPES = new Set(['FT', 'FS', 'FR', 'ND']);

export interface InvoiceQrData {
  issuerNif?: string;
  buyerNif?: string;
  buyerCountry?: string;
  documentType?: string;
  documentStatus?: string;
  /** Already converted to YYYY-MM-DD; the QR carries YYYYMMDD. */
  date?: string;
  documentNumber?: string;
  atcud?: string;
  taxRegion?: string;
  totalTaxes?: number;
  grandTotal?: number;
  hash?: string;
  certificateNumber?: string;
  /** True when the document type is one that represents money going out. */
  isInvoice: boolean;
  /** True for a credit note, which must not be recorded as a cost. */
  isCreditNote: boolean;
  /** Every raw pair, so nothing is lost for debugging a bad read. */
  raw: Record<string, string>;
}

/**
 * Parses the decoded QR text.
 *
 * Returns null when the text is not an AT invoice QR at all — a QR on the
 * packaging, a payment link, a tracking code — rather than throwing, because
 * a photograph can easily contain some other QR and that is not an error.
 */
export function parseInvoiceQr(text: string): InvoiceQrData | null {
  if (!text || !text.includes(':')) return null;

  const raw: Record<string, string> = {};
  for (const pair of text.split('*')) {
    const at = pair.indexOf(':');
    if (at <= 0) continue;
    raw[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }

  // A is the issuer's NIF and is mandatory on every AT QR. Without it this is
  // some other QR that happens to use colons.
  if (!raw.A || !/^\d{9}$/.test(raw.A)) return null;

  const type = raw.D?.toUpperCase();

  return {
    issuerNif: raw.A,
    buyerNif: raw.B && raw.B !== '999999990' ? raw.B : undefined,
    buyerCountry: raw.C,
    documentType: type,
    documentStatus: raw.E,
    date: parseQrDate(raw.F),
    documentNumber: raw.G,
    atcud: raw.H,
    taxRegion: raw.I1,
    totalTaxes: parseQrNumber(raw.N),
    grandTotal: parseQrNumber(raw.O),
    hash: raw.Q,
    certificateNumber: raw.R,
    isInvoice: type ? INVOICE_TYPES.has(type) : false,
    isCreditNote: type === 'NC',
    raw,
  };
}

/** `20260903` becomes `2026-09-03`. */
function parseQrDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** Amounts in the QR use a dot, whatever the printed document uses. */
function parseQrNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Finds and decodes an AT invoice QR in a photograph.
 *
 * The decoder is loaded on demand: it is WebAssembly, and a route that never
 * sees an invoice should not pay to load it. Returns null on anything that
 * goes wrong — no QR in frame, unreadable, some other QR — because every one
 * of those means the same thing to the caller: fall back to reading the page.
 */
export async function readInvoiceQr(image: Blob): Promise<InvoiceQrData | null> {
  try {
    const { readBarcodes } = await import('zxing-wasm/reader');
    const results = await readBarcodes(image, {
      formats: ['QRCode'],
      // A photographed till roll is often curled, so the QR is rarely square
      // to the lens. Trying harder costs milliseconds and finds codes the
      // fast path misses.
      tryHarder: true,
    });

    for (const found of results) {
      const parsed = parseInvoiceQr(found.text);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    // A missing wasm binary or a corrupt image must not take down an
    // extraction that can still proceed by reading the page.
    return null;
  }
}

/**
 * Compares what the model read against what the QR says.
 *
 * This is the only place in the pipeline where a disagreement can be settled
 * rather than flagged: the QR is generated by the till, not read off paper,
 * so where the two differ the QR is right.
 */
export interface QrComparison {
  field: string;
  extracted: string | number | undefined;
  fromQr: string | number | undefined;
  agrees: boolean;
}

/**
 * Fills in from the QR what the reading missed or got wrong.
 *
 * The QR is generated by the billing software, so for the four fields it
 * carries it is not a second opinion — it is the record. Taking it means a
 * legible QR guarantees the document number, the date, the supplier's NIF and
 * the total, whatever the photograph looked like.
 *
 * Returns the corrected copy and the list of fields that were changed, so the
 * bench can show what the QR rescued rather than quietly papering over a bad
 * reading.
 */
export function applyQrTruth(
  extracted: Record<string, unknown>,
  qr: InvoiceQrData,
): { corrected: Record<string, unknown>; changed: string[] } {
  const corrected = { ...extracted };
  const changed: string[] = [];

  const take = (field: string, truth: string | number | undefined) => {
    if (truth === undefined || truth === null || truth === '') return;
    const current = corrected[field];
    const same =
      typeof truth === 'number' && typeof current === 'number'
        ? Math.abs(truth - current) < 0.01
        : String(current ?? '').trim() === String(truth).trim();
    if (same) return;
    corrected[field] = truth;
    changed.push(field);
  };

  take('vendorTaxId', qr.issuerNif);
  take('date', qr.date);
  take('invoiceNumber', qr.documentNumber);
  take('grandTotal', qr.grandTotal);

  return { corrected, changed };
}

export function compareWithQr(
  extracted: Record<string, unknown>,
  qr: InvoiceQrData,
): QrComparison[] {
  const out: QrComparison[] = [];

  const check = (
    field: string,
    got: unknown,
    truth: string | number | undefined,
  ) => {
    if (truth === undefined) return;
    const gotValue = got as string | number | undefined;
    const agrees =
      typeof truth === 'number' && typeof gotValue === 'number'
        ? Math.abs(truth - gotValue) < 0.01
        : String(gotValue ?? '').trim() === String(truth).trim();
    out.push({ field, extracted: gotValue, fromQr: truth, agrees });
  };

  check('vendorTaxId', extracted.vendorTaxId, qr.issuerNif);
  check('date', extracted.date, qr.date);
  check('invoiceNumber', extracted.invoiceNumber, qr.documentNumber);
  check('grandTotal', extracted.grandTotal, qr.grandTotal);

  return out;
}
