import { describe, it, expect } from 'vitest';
import {
  newInboxToken, tokenFromRecipients, secretMatches, pickAttachments, base64Bytes, TOKEN_LENGTH,
} from '@/lib/invoice-email';

const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString('base64');

describe('inbox tokens', () => {
  it('are long, random and free of look-alike characters', () => {
    const a = newInboxToken();
    expect(a).toHaveLength(TOKEN_LENGTH);
    expect(a).toMatch(/^[a-z2-9]+$/);
    expect(a).not.toMatch(/[01oil]/);
    expect(newInboxToken()).not.toBe(a);
  });

  it('are found among the recipients, and nothing else is', () => {
    const token = newInboxToken();
    expect(tokenFromRecipients(`Contabilidade <conta@x.pt>, Faturas <${token}@faturas.rest-finance.pt>`)).toBe(token);
    expect(tokenFromRecipients(`${token.toUpperCase()}@faturas.rest-finance.pt`)).toBe(token);
    expect(tokenFromRecipients('geral@restaurante.pt')).toBeNull();
    expect(tokenFromRecipients('short@faturas.rest-finance.pt')).toBeNull();
  });
});

describe('secretMatches', () => {
  it('needs the exact secret, and a configured one', () => {
    expect(secretMatches('s3cret', 's3cret')).toBe(true);
    expect(secretMatches('s3cre', 's3cret')).toBe(false);
    expect(secretMatches(null, 's3cret')).toBe(false);
    expect(secretMatches('anything', undefined)).toBe(false);
  });
});

describe('pickAttachments', () => {
  it('reads PDFs and invoice-sized photos, and skips logos and other files', () => {
    const { accepted, skipped } = pickAttachments([
      { filename: 'FT 2026-4471.pdf', contentType: 'application/pdf', content: b64(80_000) },
      { filename: 'foto.jpg', contentType: 'image/jpeg', content: b64(300_000) },
      { filename: 'logo.png', contentType: 'image/png', content: b64(6_000) },
      { filename: 'fatura.xml', contentType: 'application/xml', content: b64(5_000) },
      { filename: 'scan.PDF', contentType: 'application/octet-stream', content: b64(50_000) },
    ]);
    expect(accepted.map((a) => [a.filename, a.mediaType])).toEqual([
      ['FT 2026-4471.pdf', 'application/pdf'],
      ['foto.jpg', 'image/jpeg'],
      ['scan.PDF', 'application/pdf'],
    ]);
    expect(skipped).toEqual([
      { filename: 'logo.png', reason: 'tooSmall' },
      { filename: 'fatura.xml', reason: 'type' },
    ]);
  });

  it('refuses files over the limit', () => {
    const { skipped } = pickAttachments([{ filename: 'big.pdf', contentType: 'application/pdf', content: b64(8 * 1024 * 1024) }]);
    expect(skipped[0].reason).toBe('tooLarge');
  });

  it('measures base64 without decoding', () => {
    expect(base64Bytes(b64(1000))).toBe(1000);
    expect(base64Bytes(b64(1001))).toBe(1001);
  });
});
