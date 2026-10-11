/**
 * Telling the supplier from the customer on an invoice.
 *
 * A Portuguese invoice names two parties: who issued it (the supplier) and
 * who it is addressed to (the customer — the restaurant, or the owner by
 * name). Both print a name, an address and a NIF, often in similar type. A
 * reader that takes the customer block for the supplier books the invoice
 * under the restaurant's own owner, and because suppliers are matched by NIF,
 * the real supplier's NIF can end up filed under the wrong name for good.
 *
 * Pure: the caller supplies who the customer is and what the QR said.
 */

export interface CustomerIdentity {
  /** The restaurant's name and the names of the people who own it. */
  names: string[];
  /** The restaurant's own NIF, when known. */
  taxIds: string[];
}

/**
 * Why a reading's supplier is in doubt:
 * - customerNif: the supplier NIF read is the customer's own.
 * - customerName: the supplier name read is the customer's own.
 */
export type VendorDoubt = 'customerNif' | 'customerName';

/** Words that say a name is a business, not a person. */
const COMPANY_WORDS = new Set([
  'lda', 'limitada', 'sa', 'unipessoal', 'crl', 'sociedade', 'cooperativa', 'ltd', 'grupo', 'group',
  'comercio', 'distribuicao', 'distribuidora', 'distribuidor', 'cash', 'carry', 'supermercado',
  'supermercados', 'hipermercado', 'mercado', 'alimentar', 'alimentares', 'restauracao', 'talho',
  'peixaria', 'padaria', 'pastelaria', 'industria', 'industrias', 'bebidas', 'frutas', 'lacticinios',
  'portugal', 'recheio', 'makro', 'servicos', 'energia', 'comercial',
]);

/** Lower case, no accents, words separated by single spaces. */
export function normaliseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const words = (value: string) => normaliseName(value).split(' ').filter((w) => w.length >= 3);
const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/**
 * Whether a supplier name read off an invoice is in fact the customer.
 *
 * True when it is the restaurant's name, or contains every word of an
 * owner's full name, or — for an owner on file by first name only — starts
 * with that name and reads like a person rather than a business. "DANIEL
 * MARQUES ARAÚJO" is the owner Daniel; "Talho do Daniel" is a butcher.
 */
export function looksLikeCustomer(vendorName: string, customer: CustomerIdentity): boolean {
  const read = normaliseName(vendorName);
  if (!read) return false;
  const readWords = read.split(' ');
  const isBusiness = readWords.some((w) => COMPANY_WORDS.has(w));

  for (const name of customer.names) {
    const own = normaliseName(name);
    if (!own) continue;
    if (read === own) return true;
    const ownWords = words(name);
    if (ownWords.length >= 2 && ownWords.every((w) => readWords.includes(w))) return true;
    if (ownWords.length === 1 && !isBusiness && readWords.length >= 2 && readWords[0] === ownWords[0]) return true;
  }
  return false;
}

/**
 * Checks the supplier on a reading against who the customer is.
 *
 * A NIF that is the customer's own is never kept as the supplier's: the QR's
 * issuer NIF replaces it when there is one, and otherwise it is dropped, so
 * it cannot match the invoice to the wrong supplier on file.
 */
export function checkVendorReading(
  reading: { vendor: string; vendorTaxId?: string | null },
  customer: CustomerIdentity,
  qr: { issuerNif?: string; buyerNif?: string } | null = null,
): { vendorTaxId: string | undefined; doubt: VendorDoubt | null } {
  const customerNifs = new Set([...customer.taxIds.map(digits), digits(qr?.buyerNif)].filter((n) => n.length === 9));
  const read = digits(reading.vendorTaxId);

  if (read && customerNifs.has(read)) {
    const issuer = digits(qr?.issuerNif);
    return {
      vendorTaxId: issuer.length === 9 && !customerNifs.has(issuer) ? issuer : undefined,
      doubt: 'customerNif',
    };
  }
  return {
    vendorTaxId: read || undefined,
    doubt: looksLikeCustomer(reading.vendor, customer) ? 'customerName' : null,
  };
}

/**
 * Whether a new reading of a supplier's name should replace the one on file.
 *
 * Only when it extends it — "PROFUNDA ORIGEM" read later as "PROFUNDA ORIGEM -
 * Profunda D'Origem-Comércio Carnes, Lda" is the same name, more fully read.
 * A different name that merely happens to be longer is a misreading, often of
 * the customer, and must never rename a supplier by itself.
 */
export function takesLongerName(current: string, reading: string): boolean {
  const a = normaliseName(current);
  const b = normaliseName(reading);
  return !!a && b.length > a.length && b.includes(a);
}
