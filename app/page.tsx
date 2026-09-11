'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight, Check, X, Receipt, Camera, TrendingDown,
  BarChart3, FileText, Users, Sparkle,
} from 'lucide-react';
import AuthModal from './components/AuthModal';
import Logo, { Wordmark } from './components/Logo';
import TiltCard from './components/landing/TiltCard';
import WorkflowDiagram from './components/landing/WorkflowDiagram';
import {
  DailyEntryArt, ScanArt, PriceAlertArt,
  PrimeCostArt, ReportArt, TeamArt,
} from './components/landing/Illustrations';
import LanguageSelector from './components/LanguageSelector';
import Reveal from './components/landing/Reveal';
import MetricPanel from './components/landing/MetricPanel';
import FaqList from './components/landing/FaqList';
import { useLanguage } from '@/lib/language-context';

function LandingPageInner() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'login' | 'register'>('login');

  const openModal = useCallback((tab: 'login' | 'register') => {
    setModalTab(tab);
    setModalOpen(true);
  }, []);

  useEffect(() => {
    const auth = searchParams.get('auth');
    if (auth === 'login' || auth === 'register') openModal(auth);
  }, [searchParams, openModal]);

  // The navbar dispatches this rather than importing page state.
  useEffect(() => {
    const handler = (e: Event) => openModal((e as CustomEvent<'login' | 'register'>).detail);
    window.addEventListener('open-auth', handler);
    return () => window.removeEventListener('open-auth', handler);
  }, [openModal]);

  const features = [
    { icon: Receipt, key: 'entry', Art: DailyEntryArt },
    { icon: Camera, key: 'invoices', Art: ScanArt },
    { icon: TrendingDown, key: 'prices', Art: PriceAlertArt },
    { icon: BarChart3, key: 'kpis', Art: PrimeCostArt },
    { icon: FileText, key: 'reports', Art: ReportArt },
    { icon: Users, key: 'team', Art: TeamArt },
  ] as const;

  const metrics = ['primeCost', 'foodCost', 'margin'] as const;
  const steps = ['one', 'two', 'three'] as const;
  const faqs = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

  return (
    <>
      <AuthModal open={modalOpen} onOpenChange={setModalOpen} defaultTab={modalTab} />

      {/* HERO: asymmetric split. Copy left, real calculated metrics right. */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto max-w-7xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-subtle px-3 py-1 text-xs font-medium text-primary-ink">
                <Sparkle className="w-3 h-3" aria-hidden="true" />
                {t('landing.hero.badge')}
              </span>

              <h1 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
                {t('landing.hero.headline')}{' '}
                <span className="text-primary-ink">{t('landing.hero.headlineAccent')}</span>
              </h1>

              <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-[52ch]">
                {t('landing.hero.sub')}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button onClick={() => openModal('register')} className="cta-button group">
                  {t('landing.hero.cta')}
                  <ArrowRight
                    className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
                <button onClick={() => openModal('login')} className="cta-button-secondary">
                  {t('landing.hero.ctaSecondary')}
                </button>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">{t('landing.hero.note')}</p>
            </div>

            <div className="lg:col-span-6 lg:pl-8">
              <TiltCard>
              <MetricPanel
                labels={{
                  primeCost: t('landing.metrics.primeCost.label'),
                  foodCost: t('landing.metrics.foodCost.label'),
                  margin: t('landing.metrics.margin.label'),
                  revenue: t('landing.metrics.revenueLabel'),
                  example: t('landing.metrics.exampleLabel'),
                  healthy: t('landing.metrics.healthyLabel'),
                }}
              />
              </TiltCard>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM: two columns of prose and a contrast list. */}
      <section className="section-y border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
            <div className="lg:col-span-5">
              <Reveal>
                <h2 className="section-title">{t('landing.problem.title')}</h2>
              </Reveal>
            </div>
            <div className="lg:col-span-7">
              <Reveal delay={80}>
                <p className="text-lg text-muted-foreground leading-relaxed max-w-[58ch]">
                  {t('landing.problem.body')}
                </p>
                <ul className="mt-8 space-y-3">
                  {(['one', 'two', 'three'] as const).map((k) => (
                    <li key={k} className="flex items-start gap-3 text-muted-foreground">
                      <X className="w-4 h-4 mt-1 shrink-0 text-danger" aria-hidden="true" />
                      {t(`landing.problem.points.${k}`)}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES: bento with varied cell weights, not three equal cards. */}
      <section id="features" className="section-y border-b border-border">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <h2 className="section-title">{t('landing.features.title')}</h2>
            <p className="section-subtitle mt-4">{t('landing.solution.body')}</p>
          </Reveal>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
            {features.map(({ icon: Icon, key, Art }, i) => (
              <Reveal key={key} delay={i * 60}>
                <div className="h-full bg-card p-6 lg:p-8 flex flex-col">
                  <Icon className="w-5 h-5 text-primary-ink" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold text-foreground">
                    {t(`landing.features.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {t(`landing.features.${key}.body`)}
                  </p>
                  <Art className="mt-6 -mx-2 text-foreground" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* METRICS: wide rows, each with its healthy range. */}
      <section id="metrics" className="section-y border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <h2 className="section-title">{t('landing.metrics.title')}</h2>
            <p className="section-subtitle mt-4">{t('landing.metrics.body')}</p>
          </Reveal>

          <dl className="mt-12 divide-y divide-border border-y border-border">
            {metrics.map((key, i) => (
              <Reveal key={key} delay={i * 60}>
                <div className="grid md:grid-cols-12 gap-4 md:gap-8 py-7 items-baseline">
                  <dt className="md:col-span-3 font-display text-xl font-semibold text-foreground">
                    {t(`landing.metrics.${key}.label`)}
                  </dt>
                  <dd className="md:col-span-6 text-muted-foreground leading-relaxed">
                    {t(`landing.metrics.${key}.body`)}
                  </dd>
                  <dd className="md:col-span-3 md:text-right">
                    <span className="figure text-sm text-primary-ink font-medium">
                      {t(`landing.metrics.${key}.range`)}
                    </span>
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* HOW IT WORKS: numbered horizontal steps. */}
      <section id="how" className="section-y border-b border-border">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <h2 className="section-title">{t('landing.how.title')}</h2>
          </Reveal>

          {/* The same three stages the list below describes, drawn. */}
          <WorkflowDiagram
            className="mt-10 hidden md:block"
            labels={{
              input: t('landing.how.flowInput'),
              inputDetail: t('landing.how.flowInputDetail'),
              engine: t('landing.how.flowEngine'),
              engineDetail: t('landing.how.flowEngineDetail'),
              output: t('landing.how.flowOutput'),
              outputDetail: t('landing.how.flowOutputDetail'),
            }}
          />

          <ol className="mt-12 grid md:grid-cols-3 gap-8 md:gap-12">
            {steps.map((key, i) => (
              <Reveal key={key} delay={i * 80}>
                <li className="relative">
                  <span className="figure text-sm font-semibold text-primary-ink">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                    {t(`landing.how.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {t(`landing.how.${key}.body`)}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* BETA: single centred statement. Replaces the old pricing table. */}
      <section className="section-y border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <h2 className="section-title">{t('landing.beta.title')}</h2>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
              {t('landing.beta.body')}
            </p>
            <button onClick={() => openModal('register')} className="cta-button mt-8">
              {t('landing.beta.cta')}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section-y border-b border-border">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className="section-title">{t('landing.faq.title')}</h2>
            <div className="mt-10">
              <FaqList
                items={faqs.map((k) => ({
                  q: t(`landing.faq.${k}.q`),
                  a: t(`landing.faq.${k}.a`),
                }))}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="section-y">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className="rounded-2xl border border-border bg-card px-8 py-14 md:px-14 text-center">
              <h2 className="section-title">{t('landing.finalCta.title')}</h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-[48ch] mx-auto">
                {t('landing.finalCta.body')}
              </p>
              <button onClick={() => openModal('register')} className="cta-button mt-8 group">
                {t('landing.finalCta.cta')}
                <ArrowRight
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Wordmark markSize={32} />
              <p className="mt-3 text-sm text-muted-foreground max-w-[28ch]">
                {t('landing.footer.tagline')}
              </p>
              <div className="mt-5">
                <LanguageSelector />
              </div>
            </div>

            <nav aria-labelledby="footer-product">
              <h2 id="footer-product" className="text-sm font-semibold text-foreground">
                {t('landing.footer.product')}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.nav.features')}
                  </a>
                </li>
                <li>
                  <a href="#metrics" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.nav.metrics')}
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.nav.faq')}
                  </a>
                </li>
              </ul>
            </nav>

            <nav aria-labelledby="footer-company">
              <h2 id="footer-company" className="text-sm font-semibold text-foreground">
                {t('landing.footer.company')}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.footer.about')}
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.footer.contact')}
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-labelledby="footer-legal">
              <h2 id="footer-legal" className="text-sm font-semibold text-foreground">
                {t('landing.footer.legal')}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.footer.privacy')}
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                    {t('landing.footer.terms')}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
            © {new Date().getFullYear()} REST Finance. {t('landing.footer.rights')}
          </div>
        </div>
      </footer>
    </>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingPageInner />
    </Suspense>
  );
}
