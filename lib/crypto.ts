import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Encryption for secrets stored in the database.
 *
 * Used for third-party credentials an administrator enters through the UI
 * (currently the Google OAuth client secret). AES-256-GCM is authenticated,
 * so tampering is detected on decrypt rather than silently producing
 * different plaintext.
 *
 * The key is derived from AUTH_SECRET, which already exists and is already
 * treated as sensitive. Rotating AUTH_SECRET therefore invalidates stored
 * secrets: they have to be re-entered, which is the safe direction.
 */

const ALGORITHM = 'aes-256-gcm';
// Fixed salt: the input is already a high-entropy secret, so this is key
// derivation for length, not password stretching.
const SALT = 'rest-finance-secret-store-v1';

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET must be set before storing or reading secrets.');
  }
  return scryptSync(secret, SALT, 32);
}

/** Returns "iv:authTag:ciphertext", all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/** Returns null when the value is malformed or fails authentication. */
export function decryptSecret(stored: string): string | null {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, dataB64] = parts;
    // dataB64 is legitimately empty when the stored secret was an empty
    // string, so only the iv and tag are required to be present.
    if (!ivB64 || !tagB64) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key, tampered ciphertext or corrupt value. Never throw into a
    // request path over a stored secret.
    return null;
  }
}

/** Shows enough of a secret to recognise it, without revealing it. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}${'•'.repeat(12)}${value.slice(-4)}`;
}
