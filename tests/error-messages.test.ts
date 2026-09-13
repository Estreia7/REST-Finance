import { describe, it, expect } from 'vitest';
import { translateError } from '@/lib/error-messages';

/**
 * Server actions hand back translation keys. This is what turns one into the
 * sentence the reader sees, and the cases below are the ones that decide
 * whether a failure is explained or just looks broken.
 */
describe('translateError', () => {
  it('translates a known key into the reader’s language', () => {
    expect(translateError('pt', 'errors.write')).toBe(
      'Não foi possível guardar as alterações. Tente novamente.',
    );
    expect(translateError('en', 'errors.write')).toBe(
      'Could not save your changes. Please try again.',
    );
  });

  it('falls back to the generic message when nothing was returned', () => {
    expect(translateError('en', undefined)).toBe('Something went wrong. Please try again.');
    expect(translateError('en', null)).toBe('Something went wrong. Please try again.');
    expect(translateError('en', '')).toBe('Something went wrong. Please try again.');
  });

  it('passes a plain sentence through untouched', () => {
    // Not every call site has been migrated, and a half-migrated message must
    // still reach the reader rather than being swallowed.
    expect(translateError('en', 'Palavra-passe atual incorreta')).toBe(
      'Palavra-passe atual incorreta',
    );
    expect(translateError('en', 'User not found')).toBe('User not found');
  });

  it('never shows a raw key to the reader', () => {
    // An unknown key means we shipped a message the dictionary has not caught
    // up with; the reader gets the generic line, not "errors.somethingNew".
    expect(translateError('en', 'errors.somethingNew')).toBe(
      'Something went wrong. Please try again.',
    );
    expect(translateError('pt', 'some.unknown.key')).toBe('Ocorreu um erro. Tente novamente.');
  });
});
