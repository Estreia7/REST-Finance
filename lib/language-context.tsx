'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Language, getTranslation } from './translations';

/**
 * The language for the interface.
 *
 * The initial value comes from the server, which has already consulted the
 * account, the cookie and the browser's own preference. That is what keeps the
 * first paint in the right language instead of rendering Portuguese and
 * switching after hydration.
 *
 * Changing it writes a cookie immediately, so the very next request renders
 * correctly, and saves to the account when someone is signed in, so the choice
 * follows them to another device.
 */

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/** A year: long enough that a signed-out visitor is not asked again. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** Resolved on the server. See `lib/server-language.ts`. */
  initialLanguage: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    document.documentElement.lang = lang;

    // Written straight away rather than awaited: the next navigation has to
    // render in the new language even if the account save is still in flight,
    // or is never made because nobody is signed in.
    document.cookie = `rf_language=${lang}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;

    // Signed out, this is a no-op on the server and the cookie carries the
    // choice on its own.
    void fetch('/api/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {
      // The cookie already holds the choice, so a failed save is not worth
      // interrupting the person for.
    });
  }, []);

  const t = useCallback(
    (key: string): string => getTranslation(language, key),
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
