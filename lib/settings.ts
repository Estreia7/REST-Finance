import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

/**
 * Platform settings, editable by an administrator without a redeploy.
 *
 * Secret values are encrypted at rest (lib/crypto.ts). Reads fall back to the
 * environment, so a value set in .env keeps working and the database only
 * overrides it when an administrator has actually entered one.
 */

export const SETTING_KEYS = {
  googleClientId: 'auth.google.clientId',
  googleClientSecret: 'auth.google.clientSecret',
  /** Whether anyone can create an account, or only an admin can. */
  openRegistration: 'auth.openRegistration',
  /** Reads photographed invoices and till reports. */
  anthropicApiKey: 'scanner.anthropicApiKey',
} as const;

/** Which settings hold secrets, and therefore must be encrypted. */
const SECRET_KEYS = new Set<string>([
  SETTING_KEYS.googleClientSecret,
  SETTING_KEYS.anthropicApiKey,
]);

/** Environment variable consulted when no database value is set. */
const ENV_FALLBACK: Record<string, string | undefined> = {
  [SETTING_KEYS.googleClientId]: 'GOOGLE_CLIENT_ID',
  [SETTING_KEYS.googleClientSecret]: 'GOOGLE_CLIENT_SECRET',
  [SETTING_KEYS.anthropicApiKey]: 'ANTHROPIC_API_KEY',
};

export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });

    if (row) {
      const value = row.encrypted ? decryptSecret(row.value) : row.value;
      // A null here means the ciphertext could not be authenticated, usually
      // because AUTH_SECRET changed. Fall through to the environment rather
      // than returning a corrupt value.
      if (value !== null && value !== '') return value;
    }
  } catch {
    // The table may not exist yet during a first deploy. Never let a settings
    // lookup break sign-in.
  }

  const envName = ENV_FALLBACK[key];
  const fromEnv = envName ? process.env[envName] : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

export async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  const shouldEncrypt = SECRET_KEYS.has(key);
  const stored = shouldEncrypt ? encryptSecret(value) : value;

  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: stored, encrypted: shouldEncrypt, updatedBy },
    update: { value: stored, encrypted: shouldEncrypt, updatedBy },
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key } });
}

/**
 * Whether self-service registration is open.
 *
 * Closed by default: during the private beta accounts are created by an
 * administrator after an access request, and a public signup form on a
 * discoverable domain contradicts that.
 */
export async function isRegistrationOpen(): Promise<boolean> {
  const value = await getSetting(SETTING_KEYS.openRegistration);
  return value === 'true';
}

/** Google OAuth credentials, from the database or the environment. */
export async function getGoogleCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const [clientId, clientSecret] = await Promise.all([
    getSetting(SETTING_KEYS.googleClientId),
    getSetting(SETTING_KEYS.googleClientSecret),
  ]);

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** The key the document reader authenticates with, if one is configured. */
export async function getAnthropicApiKey(): Promise<string | null> {
  return getSetting(SETTING_KEYS.anthropicApiKey);
}
