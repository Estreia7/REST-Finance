'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { STRIPE_PRICES } from '@/lib/stripe';
import { useLanguage } from '@/lib/language-context';

interface UpgradeWallProps {
  reason: 'trial_expired' | 'subscription_canceled' | 'payment_failed';
  restaurantId: string;
}

/**
 * The plans carry translation keys rather than text: this list is module-level,
 * outside any React tree, so it cannot resolve them itself. The component does
 * it at render, which is also what keeps the wall correct when someone switches
 * language while looking at it.
 */
const PLANS = [
  {
    nameKey:   'upgradeWall.standardName',
    price:     29,
    priceId:   STRIPE_PRICES.STANDARD_MONTHLY,
    yearlyId:  STRIPE_PRICES.STANDARD_YEARLY,
    yearPrice: 290,
    featureKeys: [
      'upgradeWall.standardFeature1',
      'upgradeWall.standardFeature2',
      'upgradeWall.standardFeature3',
      'upgradeWall.standardFeature4',
      'upgradeWall.standardFeature5',
    ],
  },
  {
    nameKey:   'upgradeWall.proName',
    price:     79,
    priceId:   STRIPE_PRICES.PRO_MONTHLY,
    yearlyId:  STRIPE_PRICES.PRO_YEARLY,
    yearPrice: 790,
    recommended: true,
    featureKeys: [
      'upgradeWall.proFeature1',
      'upgradeWall.proFeature2',
      'upgradeWall.proFeature3',
      'upgradeWall.proFeature4',
      'upgradeWall.proFeature5',
    ],
  },
];

const HEADLINE_KEYS: Record<UpgradeWallProps['reason'], { title: string; sub: string }> = {
  trial_expired:         { title: 'upgradeWall.trialExpiredTitle',   sub: 'upgradeWall.trialExpiredSub' },
  subscription_canceled: { title: 'upgradeWall.canceledTitle',       sub: 'upgradeWall.canceledSub' },
  payment_failed:        { title: 'upgradeWall.paymentFailedTitle',  sub: 'upgradeWall.paymentFailedSub' },
};

export default function UpgradeWall({ reason, restaurantId }: UpgradeWallProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling]   = useState<'monthly' | 'yearly'>('monthly');

  const headline = HEADLINE_KEYS[reason];

  const handleUpgrade = async (priceId: string) => {
    setLoading(priceId);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId, restaurantId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <div className="relative w-full max-w-3xl text-center">
        <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-6 shadow-glow">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground mb-3">{t(headline.title)}</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">{t(headline.sub)}</p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted mb-10">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${billing === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {t('upgradeWall.monthly')}
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${billing === 'yearly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {t('upgradeWall.yearly')} <span className="text-xs text-green-400 ml-1">{t('upgradeWall.yearlyDiscount')}</span>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5 text-left mb-8">
          {PLANS.map(plan => {
            const pid = billing === 'monthly' ? plan.priceId : plan.yearlyId;
            const price = billing === 'monthly' ? plan.price : Math.round(plan.yearPrice / 12);
            const name = t(plan.nameKey);
            return (
              <div key={plan.nameKey} className={`relative rounded-2xl p-7 flex flex-col ${plan.recommended ? 'glow-border bg-primary-subtle' : 'card-glass'}`}>
                {plan.recommended && (
                  <div className="absolute -top-3 left-6">
                    <span className="px-3 py-1 text-xs font-bold gradient-bg text-white rounded-full">{t('upgradeWall.recommended')}</span>
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-bold text-foreground text-lg">{name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-foreground">€{price}</span>
                    <span className="text-sm text-muted-foreground">{t('upgradeWall.perMonth')}</span>
                  </div>
                  {billing === 'yearly' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('upgradeWall.billedYearlyPrefix')} €{plan.yearPrice}{t('upgradeWall.billedYearlySuffix')}
                    </p>
                  )}
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.featureKeys.map(key => (
                    <li key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />{t(key)}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(pid)}
                  disabled={loading !== null}
                  className={plan.recommended ? 'cta-button w-full justify-center' : 'cta-button-secondary w-full justify-center'}
                >
                  {loading === pid ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{t('upgradeWall.redirecting')}</>
                  ) : (
                    <>{t('upgradeWall.choosePlan')} {name}<ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-green-400" />
          {t('upgradeWall.reassurance')}
        </p>
      </div>
    </div>
  );
}
