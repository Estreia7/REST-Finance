import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { priceIdToPlan } from '@/lib/stripe';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Idempotency: skip already-processed events
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing?.processed) {
    return NextResponse.json({ received: true, skipped: true });
  }

  // Store event for idempotency tracking
  await prisma.stripeEvent.upsert({
    where:  { id: event.id },
    create: { id: event.id, type: event.type, data: event.data as any, processed: false },
    update: {},
  });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId    = sub.items.data[0]?.price.id ?? '';
        const plan       = priceIdToPlan(priceId);

        await prisma.restaurant.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan,
            stripeSubscriptionId: sub.id,
            subscriptionStatus:   sub.status,
            currentPeriodEnd:     new Date((sub as any).current_period_end * 1000),
            cancelAtPeriodEnd:    sub.cancel_at_period_end,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await prisma.restaurant.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan:                'TRIAL',
            subscriptionStatus:  'canceled',
            stripeSubscriptionId: null,
            currentPeriodEnd:     null,
            cancelAtPeriodEnd:    false,
          },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await prisma.restaurant.updateMany({
          where: { stripeCustomerId: customerId },
          data:  { subscriptionStatus: 'past_due' },
        });
        break;
      }

      case 'invoice.paid': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await prisma.restaurant.updateMany({
          where: { stripeCustomerId: customerId },
          data:  { subscriptionStatus: 'active' },
        });
        break;
      }
    }

    // Mark event as processed
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data:  { processed: true },
    });

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[webhook] Handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
