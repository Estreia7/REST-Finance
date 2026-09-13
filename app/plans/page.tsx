'use client';

import Link from 'next/link';
import { Check, ArrowRight, Zap, Star, Crown } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

export default function PlansPage() {
  const { t } = useLanguage();

  /**
   * `href` is carried on the plan rather than derived from its name: the name is
   * translated now, so branching on it would have sent English visitors to the
   * wrong page.
   */
  const plans = [
    {
      id: 'trial',
      nameKey: 'plansPage.trialName',
      descriptionKey: 'plansPage.trialDescription',
      priceKey: 'plansPage.trialPrice',
      periodKey: 'plansPage.trialPeriod',
      icon: Zap,
      featureKeys: [
        'plansPage.trialFeature1',
        'plansPage.trialFeature2',
        'plansPage.trialFeature3',
        'plansPage.trialFeature4',
        'plansPage.trialFeature5',
        'plansPage.trialFeature6',
      ],
      ctaKey: 'plansPage.trialCta',
      href: '/register',
      popular: false,
      gradient: 'from-muted to-muted/50',
    },
    {
      id: 'standard',
      nameKey: 'plansPage.standardName',
      descriptionKey: 'plansPage.standardDescription',
      price: '€29',
      periodKey: 'plansPage.standardPeriod',
      icon: Star,
      featureKeys: [
        'plansPage.standardFeature1',
        'plansPage.standardFeature2',
        'plansPage.standardFeature3',
        'plansPage.standardFeature4',
        'plansPage.standardFeature5',
        'plansPage.standardFeature6',
        'plansPage.standardFeature7',
      ],
      ctaKey: 'plansPage.standardCta',
      href: '/contact',
      popular: true,
      gradient: 'from-primary to-accent',
    },
    {
      id: 'pro',
      nameKey: 'plansPage.proName',
      descriptionKey: 'plansPage.proDescription',
      price: '€79',
      periodKey: 'plansPage.proPeriod',
      icon: Crown,
      featureKeys: [
        'plansPage.proFeature1',
        'plansPage.proFeature2',
        'plansPage.proFeature3',
        'plansPage.proFeature4',
        'plansPage.proFeature5',
        'plansPage.proFeature6',
        'plansPage.proFeature7',
        'plansPage.proFeature8',
      ],
      ctaKey: 'plansPage.proCta',
      href: '/contact',
      popular: false,
      gradient: 'from-accent to-primary',
    },
  ];

  const faqs = [
    { questionKey: 'plansPage.faq1Question', answerKey: 'plansPage.faq1Answer' },
    { questionKey: 'plansPage.faq2Question', answerKey: 'plansPage.faq2Answer' },
    { questionKey: 'plansPage.faq3Question', answerKey: 'plansPage.faq3Answer' },
    { questionKey: 'plansPage.faq4Question', answerKey: 'plansPage.faq4Answer' },
  ];

  return (
    <main className="flex-1 min-h-screen pt-16 md:pt-20">
      <div className="container py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Hero Section */}
          <section className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              {t('plansPage.heroTitleLead')}{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {t('plansPage.heroTitleAccent')}
              </span>{' '}
              {t('plansPage.heroTitleTail')}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t('plansPage.heroSubtitle')}
            </p>
          </section>

          {/* Plans Grid */}
          <section className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.id}
                  className={`card p-8 space-y-6 relative ${
                    plan.popular
                      ? 'border-primary/50 border-2 scale-105 md:scale-110'
                      : ''
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="px-4 py-1 bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-bold rounded-full">
                        {t('plansPage.mostPopular')}
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                      <Icon className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">{t(plan.nameKey)}</h3>
                      <p className="text-muted-foreground text-sm">{t(plan.descriptionKey)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold">
                        {plan.priceKey ? t(plan.priceKey) : plan.price}
                      </span>
                      <span className="text-muted-foreground">/{t(plan.periodKey)}</span>
                    </div>
                  </div>

                  <ul className="space-y-3 flex-1">
                    {plan.featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{t(featureKey)}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className={`w-full block text-center py-3 px-6 rounded-lg font-semibold transition-all duration-300 ${
                      plan.popular
                        ? 'cta-button'
                        : 'cta-button-secondary'
                    }`}
                  >
                    {t(plan.ctaKey)}
                    <ArrowRight className="inline-block ml-2 w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </section>

          {/* FAQ Section */}
          <section className="card p-8 md:p-12 space-y-6">
            <h2 className="text-3xl font-bold text-center mb-8">{t('plansPage.faqTitle')}</h2>
            <div className="space-y-6">
              {faqs.map(({ questionKey, answerKey }) => (
                <div key={questionKey} className="space-y-2">
                  <h3 className="text-lg font-semibold">{t(questionKey)}</h3>
                  <p className="text-muted-foreground">{t(answerKey)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA Section */}
          <section className="text-center space-y-6">
            <h2 className="text-3xl font-bold">{t('plansPage.ctaTitle')}</h2>
            <p className="text-lg text-muted-foreground">
              {t('plansPage.ctaSubtitle')}
            </p>
            <Link
              href="/contact"
              className="cta-button-secondary inline-flex items-center gap-2"
            >
              {t('plansPage.ctaButton')}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
