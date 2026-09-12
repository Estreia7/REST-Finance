import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-for-key-derivation-only';
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a value', () => {
    const secret = 'GOCSPX-abc123def456ghi789';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces different ciphertext each time', () => {
    // A fresh IV per call, so identical secrets do not look identical at rest.
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('round-trips unicode and empty strings', () => {
    expect(decryptSecret(encryptSecret('chave-única-çã'))).toBe('chave-única-çã');
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('returns null for a tampered value rather than wrong plaintext', () => {
    const stored = encryptSecret('original');
    const [iv, tag, data] = stored.split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    expect(decryptSecret([iv, tag, flipped.toString('base64')].join(':'))).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(decryptSecret('not-encrypted')).toBeNull();
    expect(decryptSecret('')).toBeNull();
  });

  it('returns null when decrypted with a different key', () => {
    const stored = encryptSecret('secret');
    process.env.AUTH_SECRET = 'a-completely-different-secret-value';
    const result = decryptSecret(stored);
    process.env.AUTH_SECRET = 'test-secret-for-key-derivation-only';
    expect(result).toBeNull();
  });
});

describe('maskSecret', () => {
  it('keeps only the ends visible', () => {
    const masked = maskSecret('GOCSPX-abc123def456');
    expect(masked.startsWith('GOCS')).toBe(true);
    expect(masked.endsWith('f456')).toBe(true);
    expect(masked).not.toContain('abc123');
  });

  it('reveals nothing for short values', () => {
    expect(maskSecret('short')).toBe('••••••••');
  });
});
