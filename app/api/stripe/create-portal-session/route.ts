import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const authResult = await requireAuth();
  if (isAuthError(authResult)) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { restaurantId } = await req.json();

  const membership = await prisma.membership.findFirst({
    where: { userId: authResult.userId, restaurantId, role: 'OWNER', active: true },
    include: { restaurant: true },
  });

  if (!membership?.restaurant.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   membership.restaurant.stripeCustomerId,
    return_url: `${origin}/dashboard?tab=billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
