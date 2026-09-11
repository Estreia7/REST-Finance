import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  // Authenticate user
  const authResult = await requireAuth();
  if (isAuthError(authResult)) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { priceId, restaurantId } = await req.json();

  // Validate price ID
  const validPrices = Object.values(STRIPE_PRICES);
  if (!validPrices.includes(priceId)) {
    return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
  }

  // Verify restaurant belongs to user
  const membership = await prisma.membership.findFirst({
    where: { userId: authResult.userId, restaurantId, role: 'OWNER', active: true },
    include: { restaurant: true },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  const restaurant = membership.restaurant;

  // Get or create Stripe customer
  let customerId = restaurant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: authResult.email,
      metadata: { restaurantId, userId: authResult.userId },
    });
    customerId = customer.id;
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data:  { stripeCustomerId: customerId },
    });
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?upgrade=success`,
    cancel_url:  `${origin}/dashboard?upgrade=canceled`,
    metadata: { restaurantId, userId: authResult.userId },
    subscription_data: {
      metadata: { restaurantId, userId: authResult.userId },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    locale: 'pt',
  });

  return NextResponse.json({ url: session.url });
}
