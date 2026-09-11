'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { STRIPE_PRICES } from '@/lib/stripe';
import { toClientError } from '@/lib/errors';

export async function getSubscriptionStatus() {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return null;

    const r = await prisma.restaurant.findUnique({
      where: { id: owner.restaurantId },
    });
    if (!r) return null;

    return {
      plan:                r.plan,
      subscriptionStatus:  r.subscriptionStatus,
      currentPeriodEnd:    r.currentPeriodEnd,
      cancelAtPeriodEnd:   r.cancelAtPeriodEnd,
      stripeCustomerId:    r.stripeCustomerId,
      stripeSubscriptionId: r.stripeSubscriptionId,
      trialEndsAt:         r.trialEndsAt,
      restaurantId:        r.id,
    };
  } catch {
    return null;
  }
}

export async function getCheckoutUrl(priceId: string): Promise<{ url?: string; error?: string }> {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };


    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stripe/create-checkout-session`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId, restaurantId: owner.restaurantId }),
      }
    );

    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return { url: data.url };
  } catch (err: unknown) {
    return { error: toClientError('Stripe request failed', err, 'generic') };
  }
}

export async function getPortalUrl(): Promise<{ url?: string; error?: string }> {
  try {
    const owner = await requireOwner();
    if (isAuthError(owner)) return { error: owner.error };


    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stripe/create-portal-session`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ restaurantId: owner.restaurantId }),
      }
    );

    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return { url: data.url };
  } catch (err: unknown) {
    return { error: toClientError('Stripe request failed', err, 'generic') };
  }
}

export { STRIPE_PRICES };
