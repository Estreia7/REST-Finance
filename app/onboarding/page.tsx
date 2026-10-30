import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireOwner, isAuthError } from '@/lib/auth-helpers';
import { readTaxSettings } from '@/lib/tax-period';
import OnboardingWizard, { type OnboardingInitial } from './OnboardingWizard';

/**
 * First-run setup for a new owner, between signup and the dashboard.
 *
 * Only an owner whose active restaurant has not finished (or skipped) it ever
 * sees this; everyone else is sent on to the dashboard.
 */
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await requireAuth();
  if (isAuthError(session)) redirect('/login');

  const owner = await requireOwner();
  if (isAuthError(owner)) redirect('/dashboard');

  const [restaurant, tax] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
      select: {
        name: true, taxId: true, municipalityCode: true, onboardingCompleted: true,
        seats: true, serviceHoursPerDay: true, monthlyRevenueTarget: true,
      },
    }),
    readTaxSettings(owner.restaurantId),
  ]);
  if (!restaurant || restaurant.onboardingCompleted) redirect('/dashboard');

  const initial: OnboardingInitial = {
    name: restaurant.name,
    taxId: restaurant.taxId ?? '',
    municipalityCode: restaurant.municipalityCode,
    region: tax.region,
    seats: restaurant.seats ? String(restaurant.seats) : '',
    serviceHoursPerDay: restaurant.serviceHoursPerDay ? String(Number(restaurant.serviceHoursPerDay)) : '',
    monthlyRevenueTarget: restaurant.monthlyRevenueTarget ? String(Number(restaurant.monthlyRevenueTarget)) : '',
  };

  return <OnboardingWizard initial={initial} />;
}
