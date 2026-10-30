import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Invoices by email: the restaurant's private address, and what of an email
 * is worth reading.
 *
 * The address is `<token>@<INBOUND_EMAIL_DOMAIN>`. The token is the only thing
 * standing between a stranger and the restaurant's invoice list, so it is
 * random, long, and replaced (never reused) when the owner asks for a new one.
 *
 * Mail reaches the app through a Cloudflare Email Worker (infra/email-worker),
 * which posts each message to /api/inbound/invoice with a shared secret.
 */

const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export const TOKEN_LENGTH = 16;

export function newInboxToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  let out = '';
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export function invoiceAddress(token: string, domain: string): string {
  return `${token}@${domain}`;
}

/**
 * The token in a recipient list: "Faturas <abc...@faturas.x>, outro@y". The
 * first address whose local part is shaped like a token wins; anything else
 * is not ours.
 */
export function tokenFromRecipients(to: string): string | null {
  const addresses = to.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? [];
  for (const address of addresses) {
    const local = address.split('@')[0].toLowerCase();
    if (new RegExp(`^[${TOKEN_ALPHABET}]{${TOKEN_LENGTH}}$`).test(local)) return local;
  }
  return null;
}

/** Constant-time comparison of the shared secret. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface InboundAttachment {
  filename: string;
  contentType: string;
  /** Base64. */
  content: string;
}

export type ReadableType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
/** Below this an image is a logo or a signature, not a photographed invoice. */
export const MIN_IMAGE_BYTES = 40 * 1024;
export const MAX_ATTACHMENTS = 10;

function typeOf(a: InboundAttachment): ReadableType | null {
  const ct = a.contentType.toLowerCase().split(';')[0].trim();
  const name = a.filename.toLowerCase();
  if (ct === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (ct === 'image/jpeg' || ct === 'image/jpg' || /\.jpe?g$/.test(name)) return 'image/jpeg';
  if (ct === 'image/png' || name.endsWith('.png')) return 'image/png';
  if (ct === 'image/webp' || name.endsWith('.webp')) return 'image/webp';
  return null;
}

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * What of an email to read: PDFs, and photographs big enough to be an
 * invoice. Everything else is counted as skipped, with the reason.
 */
export function pickAttachments(attachments: InboundAttachment[]): {
  accepted: Array<InboundAttachment & { mediaType: ReadableType }>;
  skipped: Array<{ filename: string; reason: 'type' | 'tooSmall' | 'tooLarge' | 'tooMany' }>;
} {
  const accepted: Array<InboundAttachment & { mediaType: ReadableType }> = [];
  const skipped: Array<{ filename: string; reason: 'type' | 'tooSmall' | 'tooLarge' | 'tooMany' }> = [];
  for (const a of attachments) {
    const mediaType = typeOf(a);
    const size = base64Bytes(a.content);
    if (!mediaType) skipped.push({ filename: a.filename, reason: 'type' });
    else if (size > MAX_ATTACHMENT_BYTES) skipped.push({ filename: a.filename, reason: 'tooLarge' });
    else if (mediaType !== 'application/pdf' && size < MIN_IMAGE_BYTES) skipped.push({ filename: a.filename, reason: 'tooSmall' });
    else if (accepted.length >= MAX_ATTACHMENTS) skipped.push({ filename: a.filename, reason: 'tooMany' });
    else accepted.push({ ...a, mediaType });
  }
  return { accepted, skipped };
}
