'use client';

import { useLanguage } from '@/lib/language-context';
import {
  ShoeboxFigure, FlowFigure, BeforeAfterFigure, PrimeCostFigure, WaterfallFigure,
  DishFigure, RevenueVsCostFigure, RotaFigure, TaxFigure, ComplianceFigure,
} from '@/app/components/presentation/figures';
import ShareDeckCard from '@/app/components/presentation/ShareDeckCard';

/**
 * The sales deck, shown on a laptop or tablet while sitting across from a
 * restaurant owner.
 *
 * The drawings live in `app/components/presentation/figures.tsx` because the
 * unattended television deck at /pt and /en shows the same ones. What stays
 * here is the scrollable arrangement a person presents from by hand.
 */


function SectionHeader({ label, title, lead }: { label: string; title: string; lead?: string }) {
  return (
    <header className="max-w-2xl space-y-3">
      <p className="section-label">{label}</p>
      <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-foreground text-balance">
        {title}
      </h2>
      {lead && <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{lead}</p>}
    </header>
  );
}

function ProblemCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-glass p-5 space-y-2">
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

/**
 * The capability unit: a drawing with the claim underneath it. The figure sits
 * on its own tinted plate so the illustration reads as an exhibit rather than
 * as page furniture, and it comes first in the source order so a screen reader
 * meets the accessible title before the prose repeats it.
 */
function Capability({
  title, body, figure,
}: {
  title: string;
  body: string;
  figure: React.ReactNode;
}) {
  return (
    <article className="card-glass p-5 sm:p-6 flex flex-col gap-4">
      <div className="rounded-lg bg-surface border border-border-subtle p-3 sm:p-4">
        {figure}
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </article>
  );
}

/** A small amber tick used in the hero and closing lists. Purely ornamental. */
function TickMark() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 mt-0.5 text-primary" aria-hidden="true">
      <circle cx="8" cy="8" r="7.2" fill="currentColor" opacity={0.15} />
      <path d="M4.8 8.2 l2.2 2.2 4.2 -4.8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
          <TickMark />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function PresentationPanel() {
  const { t } = useLanguage();

  return (
    // Sectioned rather than scroll-snapped: the seller sets the pace of the
    // walkthrough, and a slide deck that fights the scroll wheel is worse to
    // present from than a page that simply flows.
    <div className="max-w-5xl mx-auto space-y-14 sm:space-y-20 pb-10">

      <ShareDeckCard />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="animate-fade-up-1">
        <div className="card-glass overflow-hidden">
          <div className="grid lg:grid-cols-[1.15fr_1fr] gap-8 p-6 sm:p-8 lg:p-10 items-center">
            <div className="space-y-5">
              <p className="section-label text-primary-ink">{t('presentation.heroEyebrow')}</p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-black leading-[1.08] tracking-tight text-foreground text-balance">
                {t('presentation.heroTitle')}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">
                {t('presentation.heroLead')}
              </p>
              <BulletList
                items={[
                  t('presentation.heroPointOne'),
                  t('presentation.heroPointTwo'),
                  t('presentation.heroPointThree'),
                ]}
              />
            </div>

            <div className="rounded-xl bg-surface border border-border-subtle p-4 sm:p-5">
              <BeforeAfterFigure title={t('presentation.beforeAfterSvgTitle')} />
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border-subtle">
                <div>
                  <p className="section-label">{t('presentation.beforeLabel')}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t('presentation.beforeCaption')}</p>
                </div>
                <div>
                  <p className="section-label text-primary-ink">{t('presentation.afterLabel')}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t('presentation.afterCaption')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 1. The problem ────────────────────────────────────────────────── */}
      <section className="space-y-7">
        <SectionHeader
          label={t('presentation.problemLabel')}
          title={t('presentation.problemTitle')}
          lead={t('presentation.problemLead')}
        />

        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
          <div className="card-glass p-5 sm:p-6">
            <ShoeboxFigure title={t('presentation.problemSvgTitle')} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ProblemCard title={t('presentation.problemOneTitle')} body={t('presentation.problemOneBody')} />
            <ProblemCard title={t('presentation.problemTwoTitle')} body={t('presentation.problemTwoBody')} />
            <ProblemCard title={t('presentation.problemThreeTitle')} body={t('presentation.problemThreeBody')} />
            <ProblemCard title={t('presentation.problemFourTitle')} body={t('presentation.problemFourBody')} />
          </div>
        </div>
      </section>

      {/* ── 2. What the app does ──────────────────────────────────────────── */}
      <section className="space-y-7">
        <SectionHeader
          label={t('presentation.solutionLabel')}
          title={t('presentation.solutionTitle')}
          lead={t('presentation.solutionLead')}
        />

        <div className="card-glass p-5 sm:p-8 space-y-6">
          <FlowFigure title={t('presentation.flowSvgTitle')} />

          <ol className="grid sm:grid-cols-3 gap-5 pt-5 border-t border-border-subtle">
            {[
              { n: 1, title: t('presentation.flowStepOneTitle'), body: t('presentation.flowStepOneBody') },
              { n: 2, title: t('presentation.flowStepTwoTitle'), body: t('presentation.flowStepTwoBody') },
              { n: 3, title: t('presentation.flowStepThreeTitle'), body: t('presentation.flowStepThreeBody') },
            ].map((step) => (
              <li key={step.n} className="space-y-1.5">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary-ink text-xs font-bold tabular-nums">
                  {step.n}
                </span>
                <h3 className="font-semibold text-sm text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 3. Capabilities ───────────────────────────────────────────────── */}
      <section className="space-y-7">
        <SectionHeader
          label={t('presentation.capabilitiesLabel')}
          title={t('presentation.capabilitiesTitle')}
          lead={t('presentation.capabilitiesLead')}
        />

        <div className="grid md:grid-cols-2 gap-5">
          <Capability
            title={t('presentation.primeTitle')}
            body={t('presentation.primeBody')}
            figure={
              <PrimeCostFigure
                title={t('presentation.primeSvgTitle')}
                healthy={t('presentation.primeGaugeHealthy')}
                watch={t('presentation.primeGaugeWatch')}
                high={t('presentation.primeGaugeHigh')}
                caption={t('presentation.primeGaugeCaption')}
              />
            }
          />

          <Capability
            title={t('presentation.marginTitle')}
            body={t('presentation.marginBody')}
            figure={
              <WaterfallFigure
                title={t('presentation.marginSvgTitle')}
                revenue={t('presentation.marginRevenue')}
                goods={t('presentation.marginGoods')}
                staff={t('presentation.marginStaff')}
                fixed={t('presentation.marginFixed')}
                profit={t('presentation.marginProfit')}
              />
            }
          />

          <Capability
            title={t('presentation.dishTitle')}
            body={t('presentation.dishBody')}
            figure={
              <DishFigure
                title={t('presentation.dishSvgTitle')}
                price={t('presentation.dishPrice')}
                cost={t('presentation.dishCost')}
                margin={t('presentation.dishMargin')}
                one={t('presentation.dishIngredientOne')}
                two={t('presentation.dishIngredientTwo')}
                three={t('presentation.dishIngredientThree')}
              />
            }
          />

          <Capability
            title={t('presentation.revenueTitle')}
            body={t('presentation.revenueBody')}
            figure={
              <RevenueVsCostFigure
                title={t('presentation.revenueSvgTitle')}
                sales={t('presentation.revenueLegendSales')}
                costs={t('presentation.revenueLegendCosts')}
              />
            }
          />

          <Capability
            title={t('presentation.staffTitle')}
            body={t('presentation.staffBody')}
            figure={
              <RotaFigure
                title={t('presentation.staffSvgTitle')}
                costLabel={t('presentation.staffCostLabel')}
              />
            }
          />

          <Capability
            title={t('presentation.taxTitle')}
            body={t('presentation.taxBody')}
            figure={
              <TaxFigure
                title={t('presentation.taxSvgTitle')}
                setAside={t('presentation.taxSetAside')}
                due={t('presentation.taxDue')}
              />
            }
          />

          {/* Compliance spans the row: the list is wide and reads badly boxed */}
          <div className="md:col-span-2">
            <Capability
              title={t('presentation.complianceTitle')}
              body={t('presentation.complianceBody')}
              figure={
                <ComplianceFigure
                  title={t('presentation.complianceSvgTitle')}
                  items={[
                    t('presentation.complianceItemOne'),
                    t('presentation.complianceItemTwo'),
                    t('presentation.complianceItemThree'),
                    t('presentation.complianceItemFour'),
                  ]}
                  ok={t('presentation.complianceOk')}
                  soon={t('presentation.complianceSoon')}
                  late={t('presentation.complianceLate')}
                />
              }
            />
          </div>
        </div>
      </section>

      {/* ── 4. Day to day ─────────────────────────────────────────────────── */}
      <section className="space-y-7">
        <SectionHeader
          label={t('presentation.dayLabel')}
          title={t('presentation.dayTitle')}
          lead={t('presentation.dayLead')}
        />

        <ol className="grid sm:grid-cols-2 gap-5">
          {[
            { n: '01', title: t('presentation.dayOneTitle'), body: t('presentation.dayOneBody') },
            { n: '02', title: t('presentation.dayTwoTitle'), body: t('presentation.dayTwoBody') },
            { n: '03', title: t('presentation.dayThreeTitle'), body: t('presentation.dayThreeBody') },
            { n: '04', title: t('presentation.dayFourTitle'), body: t('presentation.dayFourBody') },
            { n: '05', title: t('presentation.dayFiveTitle'), body: t('presentation.dayFiveBody') },
            { n: '06', title: t('presentation.daySixTitle'), body: t('presentation.daySixBody') },
          ].map((item) => (
            <li key={item.n} className="card-glass p-5 sm:p-6 flex gap-4">
              <span className="font-display text-2xl font-black tabular-nums text-primary/30 leading-none shrink-0">
                {item.n}
              </span>
              <div className="space-y-1.5 min-w-0">
                <h3 className="font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 5. The lines to remember ──────────────────────────────────────── */}
      {/* Deliberately the last thing before the close. Everything above is the
          argument; this is the part the owner should still be able to repeat
          to a partner that evening, so it is short, numbered and unhedged. */}
      <section className="space-y-7">
        <SectionHeader
          label={t('presentation.takeawayLabel')}
          title={t('presentation.takeawayTitle')}
          lead={t('presentation.takeawayLead')}
        />

        <div className="grid sm:grid-cols-2 gap-5">
          {[
            { title: t('presentation.takeawayOneTitle'), body: t('presentation.takeawayOneBody') },
            { title: t('presentation.takeawayTwoTitle'), body: t('presentation.takeawayTwoBody') },
            { title: t('presentation.takeawayThreeTitle'), body: t('presentation.takeawayThreeBody') },
            { title: t('presentation.takeawayFourTitle'), body: t('presentation.takeawayFourBody') },
          ].map((item) => (
            <article key={item.title} className="card-glass p-5 sm:p-6 flex gap-3.5">
              <TickMark />
              <div className="space-y-1.5 min-w-0">
                <h3 className="font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Close ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="card-glass p-6 sm:p-10 border-primary/30">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-foreground text-balance">
                {t('presentation.closeTitle')}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {t('presentation.closeBody')}
              </p>
            </div>
            <BulletList
              items={[
                t('presentation.closePointOne'),
                t('presentation.closePointTwo'),
                t('presentation.closePointThree'),
                t('presentation.closePointFour'),
                t('presentation.closePointFive'),
              ]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
