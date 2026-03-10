import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  // Warn in dev, don't throw — app should still boot without Stripe configured
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[stripe] STRIPE_SECRET_KEY not set — billing features will be disabled.');
  }
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    })
  : null;

// Price IDs from environment (configure in Stripe dashboard)
export const STRIPE_PRICES = {
  STANDARD_MONTHLY: process.env.STRIPE_STANDARD_MONTHLY_PRICE_ID ?? '',
  STANDARD_YEARLY:  process.env.STRIPE_STANDARD_YEARLY_PRICE_ID ?? '',
  PRO_MONTHLY:      process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? '',
  PRO_YEARLY:       process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? '',
} as const;

// Map Stripe price IDs → our Plan enum
export function priceIdToPlan(priceId: string): 'MONTHLY' | 'YEARLY' {
  if (
    priceId === STRIPE_PRICES.STANDARD_YEARLY ||
    priceId === STRIPE_PRICES.PRO_YEARLY
  ) {
    return 'YEARLY';
  }
  return 'MONTHLY';
}

// Human-readable plan labels
export const PLAN_LABELS = {
  TRIAL:   'Trial Gratuito',
  MONTHLY: 'Standard',
  YEARLY:  'Standard Anual',
} as const;

export const PLAN_PRICES = {
  STANDARD_MONTHLY: 29,
  STANDARD_YEARLY:  290,
  PRO_MONTHLY:      79,
  PRO_YEARLY:       790,
} as const;
