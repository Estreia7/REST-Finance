'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function ConditionalNavbar() {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');
  const isDashboardPage = pathname?.startsWith('/dashboard');
  // The unattended decks at /pt and /en fill the screen on a television and
  // have no navigation of their own: a site header on top of them would be
  // both unreachable by remote and in the way.
  const isDeckPage = pathname === '/pt' || pathname === '/en';

  if (isAdminPage || isDashboardPage || isDeckPage) {
    return null;
  }

  return <Navbar />;
}
