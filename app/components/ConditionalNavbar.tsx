'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function ConditionalNavbar() {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');
  const isDashboardPage = pathname?.startsWith('/dashboard');

  if (isAdminPage || isDashboardPage) {
    return null;
  }

  return <Navbar />;
}
