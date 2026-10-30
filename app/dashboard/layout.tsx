import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import ImpersonationBanner from './components/ImpersonationBanner';

/**
 * Sends an owner who has not been through first-run setup to it, once.
 *
 * Only owners: staff have nothing to set up. Never during support access: an
 * administrator signed in as a client is there to look, not to be walked
 * through the client's setup. Finishing or skipping the wizard sets the flag,
 * so this cannot loop.
 */
async function needsOnboarding(): Promise<boolean> {
  const owner = await requireOwner();
  if (isAuthError(owner) || owner.impersonatedBy) return false;
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: owner.restaurantId },
    select: { onboardingCompleted: true },
  });
  return restaurant ? !restaurant.onboardingCompleted : false;
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (await needsOnboarding()) redirect('/onboarding');

  return (
    <div className="min-h-screen bg-background">
      {children}
      {/* Shown only while an administrator is signed in for support. */}
      <ImpersonationBanner />
    </div>
  );
}
