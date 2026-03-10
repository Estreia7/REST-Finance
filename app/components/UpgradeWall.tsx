'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { STRIPE_PRICES } from '@/lib/stripe';

interface UpgradeWallProps {
  reason: 'trial_expired' | 'subscription_canceled' | 'payment_failed';
  restaurantId: string;
}

const PLANS = [
  {
    name:      'Standard',
    price:     29,
    priceId:   STRIPE_PRICES.STANDARD_MONTHLY,
    yearlyId:  STRIPE_PRICES.STANDARD_YEARLY,
    yearPrice: 290,
    features:  ['1 restaurante', 'Até 2 colaboradores', 'Relatórios PDF mensais', 'Alertas de custo', 'Suporte prioritário'],
  },
  {
    name:      'Pro',
    price:     79,
    priceId:   STRIPE_PRICES.PRO_MONTHLY,
    yearlyId:  STRIPE_PRICES.PRO_YEARLY,
    yearPrice: 790,
    recommended: true,
    features:  ['Até 3 restaurantes', 'Colaboradores ilimitados', 'Comparação anual', 'API de dados', 'Gestor dedicado'],
  },
];

export default function UpgradeWall({ reason, restaurantId }: UpgradeWallProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling]   = useState<'monthly' | 'yearly'>('monthly');

  const headlines: Record<UpgradeWallProps['reason'], { title: string; sub: string }> = {
    trial_expired:           { title: 'O teu trial gratuito terminou', sub: 'Os teus dados estão guardados. Escolhe um plano para continuar.' },
    subscription_canceled:   { title: 'Subscrição cancelada', sub: 'Renova a tua subscrição para voltar a aceder ao dashboard.' },
    payment_failed:          { title: 'Falha no pagamento', sub: 'Não conseguimos processar o teu pagamento. Actualiza o método de pagamento para continuar.' },
  };

  const { title, sub } = headlines[reason];

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/10 blur-3xl rounded-full pointer-events-none" />

      <div className="relative w-full max-w-3xl text-center">
        <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-6 shadow-glow">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground mb-3">{title}</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">{sub}</p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted mb-10">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${billing === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Mensal
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${billing === 'yearly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Anual <span className="text-xs text-green-400 ml-1">–17%</span>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5 text-left mb-8">
          {PLANS.map(plan => {
            const pid = billing === 'monthly' ? plan.priceId : plan.yearlyId;
            const price = billing === 'monthly' ? plan.price : Math.round(plan.yearPrice / 12);
            return (
              <div key={plan.name} className={`relative rounded-2xl p-7 flex flex-col ${plan.recommended ? 'glow-border bg-violet-500/[0.04]' : 'card-glass'}`}>
                {plan.recommended && (
                  <div className="absolute -top-3 left-6">
                    <span className="px-3 py-1 text-xs font-bold gradient-bg text-white rounded-full">Recomendado</span>
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-bold text-foreground text-lg">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-foreground">€{price}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                  {billing === 'yearly' && (
                    <p className="text-xs text-muted-foreground mt-1">Cobrado €{plan.yearPrice}/ano</p>
                  )}
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(pid)}
                  disabled={loading !== null}
                  className={plan.recommended ? 'cta-button w-full justify-center' : 'cta-button-secondary w-full justify-center'}
                >
                  {loading === pid ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />A redirecionar...</>
                  ) : (
                    <>Escolher {plan.name}<ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-green-400" />
          Pagamento seguro via Stripe · Cancela quando quiseres · Os teus dados estão guardados
        </p>
      </div>
    </div>
  );
}
