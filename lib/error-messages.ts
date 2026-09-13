import { getTranslation, type Language } from './translations';

/**
 * Turns what a server action returned into something to show the reader.
 *
 * Server actions return translation keys rather than sentences, because they
 * run without React context and the language belongs to whoever is reading,
 * not to the request. This resolves the key at the point of display.
 *
 * Anything unrecognised is returned unchanged. There are still messages in the
 * codebase that were written as plain sentences, and a half-migrated string
 * should reach the reader as it is rather than as a dotted key or an empty
 * toast. That also means this is safe to adopt one call site at a time.
 */
export function translateError(language: Language, value: string | undefined | null): string {
  if (!value) return getTranslation(language, 'errors.generic');

  // A key, by shape: dotted, no spaces. Anything else is a literal message.
  const looksLikeKey = /^[a-zA-Z][\w]*(\.[\w]+)+$/.test(value);
  if (!looksLikeKey) return value;

  const translated = getTranslation(language, value);
  // `getTranslation` echoes the key back when it knows nothing about it, which
  // would put "errors.somethingNew" in front of the reader.
  return translated === value ? getTranslation(language, 'errors.generic') : translated;
}
