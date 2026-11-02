import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireMember, isAuthError } from '@/lib/auth-helpers';
import { KIOSK_COOKIE } from '@/lib/time-clock';
import { restaurantModules } from '@/lib/modules-server';
import KioskPad from './KioskPad';

/**
 * The time clock's PIN pad, full screen on a tablet at the door. Only a
 * browser the owner put in kiosk mode gets here; middleware.ts keeps such a
 * browser here until the owner leaves the mode.
 */
export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  const member = await requireMember();
  if (isAuthError(member)) redirect('/login');
  if (!cookies().get(KIOSK_COOKIE)) redirect('/dashboard');

  const [restaurant, modules] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: member.restaurantId }, select: { name: true } }),
    restaurantModules(member.restaurantId),
  ]);
  // The module was switched off while this tablet was a kiosk: no pad, only
  // the way out, which still asks for the password.
  return <KioskPad restaurantName={restaurant?.name ?? ''} off={!modules.includes('timeClock')} />;
}
