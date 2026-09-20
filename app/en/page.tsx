import type { Metadata } from 'next';
import DeckPage from '@/app/components/presentation/DeckPage';

/** The English deck. See `app/pt/page.tsx` for why the address is this short. */
export const metadata: Metadata = {
  title: 'REST Finance — Presentation',
  description:
    'How REST Finance puts your restaurant’s revenue, costs and margins in one place.',
  robots: { index: false, follow: false },
};

export default function EnglishDeckPage() {
  return <DeckPage language="en" />;
}
