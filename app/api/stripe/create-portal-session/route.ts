import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { restaurantId } = await req.json();

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, restaurantId, role: 'OWNER', active: true },
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
