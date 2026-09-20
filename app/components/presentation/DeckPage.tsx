'use client';

import DeckPlayer from './DeckPlayer';
import { getTranslation, type Language } from '@/lib/translations';

/**
 * The deck at a fixed language.
 *
 * Everywhere else in the app the language is whatever the account or the
 * cookie says. Here it is whatever the address says, and nothing else: /pt is
 * the Portuguese deck even for an owner whose account is set to English,
 * because the address is what gets handed to a television or read out in a
 * meeting. A link that renders differently depending on who last signed in on
 * that television would be useless for the one job it has.
 *
 * So this deliberately does not use `useLanguage`, and translates against the
 * dictionary directly.
 */
export default function DeckPage({ language }: { language: Language }) {
  const t = (key: string) => getTranslation(language, key);

  return <DeckPlayer t={t} brand={t('presentation.heroEyebrow')} />;
}
