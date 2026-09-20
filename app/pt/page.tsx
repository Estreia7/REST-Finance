import type { Metadata } from 'next';
import DeckPage from '@/app/components/presentation/DeckPage';

/**
 * The Portuguese deck, at the shortest address we can give it.
 *
 * Short because of where it is typed: a television's on-screen keyboard,
 * letter by letter, with the arrows on a remote. Every character saved here is
 * a character someone does not spell out in front of a room.
 *
 * Open to anyone with the link, by design. It is the same sales material we
 * would hand over on paper, it names no customer and carries no figure from
 * anyone's account, and a sign-in wall would make it unusable on the one
 * device it exists for.
 */
export const metadata: Metadata = {
  title: 'REST Finance — Apresentação',
  description:
    'Como o REST Finance põe as receitas, os custos e as margens do teu restaurante num sítio só.',
  // Kept out of search results: this is a link to hand over, not a page to
  // rank. The public landing page is what should be found.
  robots: { index: false, follow: false },
};

export default function PortugueseDeckPage() {
  return <DeckPage language="pt" />;
}
