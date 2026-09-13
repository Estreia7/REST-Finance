'use client';

import Link from 'next/link';
import { Target, Users, Zap, Heart, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

export default function AboutPage() {
  const { t } = useLanguage();

  const values = [
    { icon: Zap,   titleKey: 'aboutPage.valueSimplicityTitle', bodyKey: 'aboutPage.valueSimplicityBody' },
    { icon: Heart, titleKey: 'aboutPage.valuePassionTitle',    bodyKey: 'aboutPage.valuePassionBody' },
    { icon: Users, titleKey: 'aboutPage.valueSupportTitle',    bodyKey: 'aboutPage.valueSupportBody' },
  ];

  return (
    <main className="flex-1 min-h-screen pt-16 md:pt-20">
      <div className="container py-12 md:py-20">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* Hero Section */}
          <section className="text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              {t('aboutPage.heroTitleLead')}{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {t('aboutPage.heroTitleAccent')}
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t('aboutPage.heroSubtitle')}
            </p>
          </section>

          {/* Mission */}
          <section className="card p-8 md:p-12 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <Target className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-3xl font-bold">{t('aboutPage.missionTitle')}</h2>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t('aboutPage.missionP1')}
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t('aboutPage.missionP2Before')}{' '}
              <strong className="text-foreground">{t('aboutPage.missionP2Highlight')}</strong>
              {t('aboutPage.missionP2After')}
            </p>
          </section>

          {/* Values */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center">{t('aboutPage.valuesTitle')}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {values.map(({ icon: Icon, titleKey, bodyKey }) => (
                <div key={titleKey} className="card p-6 space-y-4 text-center">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">{t(titleKey)}</h3>
                  <p className="text-muted-foreground">{t(bodyKey)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Story */}
          <section className="card p-8 md:p-12 space-y-6">
            <h2 className="text-3xl font-bold">{t('aboutPage.storyTitle')}</h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p className="text-lg">{t('aboutPage.storyP1')}</p>
              <p className="text-lg">{t('aboutPage.storyP2')}</p>
              <p className="text-lg">
                {t('aboutPage.storyP3Before')}{' '}
                <strong className="text-foreground">{t('aboutPage.storyP3Highlight')}</strong>{' '}
                {t('aboutPage.storyP3After')}
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="card p-8 md:p-12 text-center space-y-6 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border-primary/30">
            <h2 className="text-3xl font-bold">{t('aboutPage.ctaTitle')}</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('aboutPage.ctaSubtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/plans"
                className="cta-button inline-flex items-center justify-center gap-2"
              >
                {t('aboutPage.ctaPlans')}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/contact"
                className="cta-button-secondary inline-flex items-center justify-center gap-2"
              >
                {t('aboutPage.ctaContact')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
