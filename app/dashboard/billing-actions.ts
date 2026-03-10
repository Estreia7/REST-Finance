'use server';

import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { STRIPE_PRICES } from '@/lib/stripe';

export async function getSubscriptionStatus() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const membership = await prisma.membership.findFirst({
      where:   { userId: user.id, role: 'OWNER', active: true },
      include: { restaurant: true },
    });

    if (!membership) return null;
    const r = membership.restaurant;

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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Não autenticado' };

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, role: 'OWNER', active: true },
    });
    if (!membership) return { error: 'Restaurante não encontrado' };

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stripe/create-checkout-session`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId, restaurantId: membership.restaurantId }),
      }
    );

    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return { url: data.url };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getPortalUrl(): Promise<{ url?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Não autenticado' };

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, role: 'OWNER', active: true },
    });
    if (!membership) return { error: 'Restaurante não encontrado' };

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stripe/create-portal-session`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ restaurantId: membership.restaurantId }),
      }
    );

    const data = await res.json();
    if (!res.ok) return { error: data.error };
    return { url: data.url };
  } catch (err: any) {
    return { error: err.message };
  }
}

export { STRIPE_PRICES };
