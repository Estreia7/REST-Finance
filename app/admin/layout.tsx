import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthError } from '@/lib/auth-helpers';

/**
 * Server-side gate for the admin console.
 *
 * Every admin action already re-checks the PLATFORM_ADMIN role, so no data
 * could leak without this. But the shell still rendered for any signed-in
 * user, which is confusing for a restaurant owner and needlessly exposes the
 * console's shape. Checking here means non-admins never reach it at all.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  if (isAuthError(admin)) {
    // Owners and staff go to their own dashboard; anyone signed out is sent
    // to sign in by the middleware.
    redirect('/dashboard');
  }

  return <div className="min-h-screen bg-background">{children}</div>;
}
