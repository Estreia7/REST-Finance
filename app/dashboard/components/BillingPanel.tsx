'use client';

import { useState } from 'react';
import { CreditCard, CheckCircle2, ChevronRight, ExternalLink, Loader2, Crown, ShieldCheck } from 'lucide-react';
import { STRIPE_PRICES, PLAN_PRICES } from '@/lib/stripe';

interface BillingPanelProps {
  restaurant: any;
}

const PLAN_FEATURES: Record<string, string[]> = {
  TRIAL:   ['1 restaurante', 'KPIs em tempo real', 'Exportação CSV', '14 dias gratuitos'],
  MONTHLY: ['1 restaurante', 'Até 2 colaboradores', 'Relatórios PDF mensais', 'Alertas de custo', 'Suporte prioritário'],
  YEARLY:  ['1 restaurante', 'Até 2 colaboradores', 'Relatórios PDF mensais', 'Alertas de custo', 'Suporte prioritário', '2 meses gratuitos'],
};

export default function BillingPanel({ restaurant }: BillingPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const plan   = restaurant?.plan ?? 'TRIAL';
  const status = restaurant?.subscriptionStatus;
  const periodEnd = restaurant?.currentPeriodEnd
    ? new Date(restaurant.currentPeriodEnd).toLocaleDateString('pt-PT')
    : null;
  const trialEnd = restaurant?.trialEndsAt
    ? new Date(restaurant.trialEndsAt).toLocaleDateString('pt-PT')
    : null;

  const isTrial    = plan === 'TRIAL';
  const hasBilling = !!restaurant?.stripeCustomerId;

  const handleCheckout = async (priceId: string) => {
    setLoading(priceId);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId, restaurantId: restaurant?.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ restaurantId: restaurant?.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  };

  const planLabels: Record<string, string> = {
    TRIAL:   'Trial Gratuito',
    MONTHLY: 'Standard',
    YEARLY:  'Standard Anual',
  };

  const statusLabels: Record<string, { label: string; className: string }> = {
    active:     { label: 'Activo',     className: 'badge-success' },
    trialing:   { label: 'Trial',      className: 'badge-info' },
    past_due:   { label: 'Pagamento em atraso', className: 'badge-danger' },
    canceled:   { label: 'Cancelado',  className: 'badge-muted' },
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Current plan */}
      <div className="card-glass p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-foreground">Plano Actual</h2>
          {status && statusLabels[status] && (
            <span className={`badge ${statusLabels[status].className}`}>{statusLabels[status].label}</span>
          )}
        </div>

        <div className="flex items-center gap-4 p-5 rounded-xl bg-white/[0.02] border border-white/5 mb-5">
          <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center shadow-glow-sm">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-foreground text-lg">{planLabels[plan] ?? plan}</div>
            <div className="text-sm text-muted-foreground">
              {isTrial && trialEnd ? `Trial até ${trialEnd}` :
               periodEnd ? `Renova em ${periodEnd}` : '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-foreground">
              {isTrial ? 'Grátis' : plan === 'MONTHLY' ? '€29/mês' : '€290/ano'}
            </div>
          </div>
        </div>

        <ul className="space-y-2 mb-6">
          {(PLAN_FEATURES[plan] ?? []).map(f => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />{f}
            </li>
          ))}
        </ul>

        {hasBilling ? (
          <button
            onClick={handlePortal}
            disabled={loading !== null}
            className="cta-button-secondary flex items-center gap-2"
          >
            {loading === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Gerir faturação (Stripe)
          </button>
        ) : null}
      </div>

      {/* Upgrade options — only shown on trial */}
      {isTrial && (
        <div className="card-glass p-6">
          <h2 className="text-lg font-bold text-foreground mb-6">Fazer Upgrade</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                name:    'Standard',
                price:   PLAN_PRICES.STANDARD_MONTHLY,
                priceId: STRIPE_PRICES.STANDARD_MONTHLY,
                features: ['1 restaurante', 'Até 2 colaboradores', 'Relatórios PDF', 'Alertas de custo'],
              },
              {
                name:    'Pro',
                price:   PLAN_PRICES.PRO_MONTHLY,
                priceId: STRIPE_PRICES.PRO_MONTHLY,
                recommended: true,
                features: ['Até 3 restaurantes', 'Colaboradores ilimitados', 'Comparação anual', 'Gestor dedicado'],
              },
            ].map(p => (
              <div key={p.name} className={`rounded-xl p-5 ${p.recommended ? 'glow-border bg-violet-500/[0.04]' : 'bg-white/[0.02] border border-white/5'}`}>
                {p.recommended && (
                  <div className="text-xs font-bold gradient-text mb-2">Recomendado</div>
                )}
                <div className="font-bold text-foreground mb-1">{p.name}</div>
                <div className="text-2xl font-black text-foreground mb-4">
                  €{p.price}<span className="text-sm font-normal text-muted-foreground">/mês</span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleCheckout(p.priceId)}
                  disabled={loading !== null}
                  className={p.recommended ? 'cta-button w-full justify-center text-sm' : 'cta-button-secondary w-full justify-center text-sm'}
                >
                  {loading === p.priceId
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ChevronRight className="w-4 h-4" />Escolher {p.name}</>
                  }
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
            Pagamento seguro via Stripe · Cancela quando quiseres
          </p>
        </div>
      )}
    </div>
  );
}
