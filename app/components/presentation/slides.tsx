'use client';

import type { ReactNode } from 'react';
import {
  ShoeboxFigure, FlowFigure, BeforeAfterFigure, PrimeCostFigure, WaterfallFigure,
  DishFigure, RevenueVsCostFigure, RotaFigure, TaxFigure, ComplianceFigure,
} from './figures';

/**
 * The deck, as an ordered list rather than as markup.
 *
 * The admin panel arranges the same material as a page someone scrolls. A
 * television cannot scroll — it has a remote with four arrows and an OK
 * button — so the unattended deck needs the argument broken into screens that
 * each stand alone and hold for a fixed number of seconds.
 *
 * Describing a screen as data instead of as JSX is what makes that possible:
 * the player counts them, moves between them and announces "screen 4 of 16"
 * without knowing what any of them contain. Adding a screen here is a one-line
 * change and needs no change to the player at all.
 *
 * Every string is a dictionary key, never a sentence: the same list renders
 * the Portuguese deck and the English one.
 */

/** A translate function, as handed down from `useLanguage`. */
export type T = (key: string) => string;

export type Slide = {
  /** Stable identity, used for React keys and for the progress dots. */
  id: string;
  /** Small line above the title. Sets where we are in the argument. */
  eyebrowKey?: string;
  titleKey: string;
  /** One paragraph at most. On a television nobody reads two. */
  leadKey?: string;
  /**
   * The short claims beside the drawing. Three is comfortable at television
   * distance; four is the most that still reads.
   */
  points?: Array<{ titleKey: string; bodyKey?: string }>;
  /** The drawing. Built lazily so the figure's own labels can be translated. */
  figure?: (t: T) => ReactNode;
  /**
   * Seconds this screen holds before the deck moves on. Screens carrying more
   * words are given longer, rather than every screen sharing one duration that
   * is too short for the dense ones and too long for the sparse ones.
   */
  seconds: number;
};

/** The pace for an unattended run: long enough to read, short enough to hold a room. */
const SHORT = 10;
const BASE = 12;
const LONG = 15;

export const SLIDES: Slide[] = [
  // ── Opening ───────────────────────────────────────────────────────────────
  {
    id: 'hero',
    eyebrowKey: 'presentation.heroEyebrow',
    titleKey: 'presentation.heroTitle',
    leadKey: 'presentation.heroLead',
    points: [
      { titleKey: 'presentation.heroPointOne' },
      { titleKey: 'presentation.heroPointTwo' },
      { titleKey: 'presentation.heroPointThree' },
    ],
    figure: (t) => <BeforeAfterFigure title={t('presentation.beforeAfterSvgTitle')} />,
    seconds: LONG,
  },

  // ── 1. The problem ────────────────────────────────────────────────────────
  {
    id: 'problem',
    eyebrowKey: 'presentation.problemLabel',
    titleKey: 'presentation.problemTitle',
    leadKey: 'presentation.problemLead',
    figure: (t) => <ShoeboxFigure title={t('presentation.problemSvgTitle')} />,
    seconds: BASE,
  },
  {
    id: 'problem-detail',
    eyebrowKey: 'presentation.problemLabel',
    titleKey: 'presentation.problemTitle',
    points: [
      { titleKey: 'presentation.problemOneTitle', bodyKey: 'presentation.problemOneBody' },
      { titleKey: 'presentation.problemTwoTitle', bodyKey: 'presentation.problemTwoBody' },
      { titleKey: 'presentation.problemThreeTitle', bodyKey: 'presentation.problemThreeBody' },
      { titleKey: 'presentation.problemFourTitle', bodyKey: 'presentation.problemFourBody' },
    ],
    seconds: LONG,
  },

  // ── 2. What the app does ──────────────────────────────────────────────────
  {
    id: 'solution',
    eyebrowKey: 'presentation.solutionLabel',
    titleKey: 'presentation.solutionTitle',
    leadKey: 'presentation.solutionLead',
    points: [
      { titleKey: 'presentation.flowStepOneTitle', bodyKey: 'presentation.flowStepOneBody' },
      { titleKey: 'presentation.flowStepTwoTitle', bodyKey: 'presentation.flowStepTwoBody' },
      { titleKey: 'presentation.flowStepThreeTitle', bodyKey: 'presentation.flowStepThreeBody' },
    ],
    figure: (t) => <FlowFigure title={t('presentation.flowSvgTitle')} />,
    seconds: LONG,
  },

  // ── 3. Capabilities, one drawing per screen ───────────────────────────────
  {
    id: 'prime',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.primeTitle',
    leadKey: 'presentation.primeBody',
    figure: (t) => (
      <PrimeCostFigure
        title={t('presentation.primeSvgTitle')}
        healthy={t('presentation.primeGaugeHealthy')}
        watch={t('presentation.primeGaugeWatch')}
        high={t('presentation.primeGaugeHigh')}
        caption={t('presentation.primeGaugeCaption')}
      />
    ),
    seconds: BASE,
  },
  {
    id: 'margin',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.marginTitle',
    leadKey: 'presentation.marginBody',
    figure: (t) => (
      <WaterfallFigure
        title={t('presentation.marginSvgTitle')}
        revenue={t('presentation.marginRevenue')}
        goods={t('presentation.marginGoods')}
        staff={t('presentation.marginStaff')}
        fixed={t('presentation.marginFixed')}
        profit={t('presentation.marginProfit')}
      />
    ),
    seconds: BASE,
  },
  {
    id: 'dish',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.dishTitle',
    leadKey: 'presentation.dishBody',
    figure: (t) => (
      <DishFigure
        title={t('presentation.dishSvgTitle')}
        price={t('presentation.dishPrice')}
        cost={t('presentation.dishCost')}
        margin={t('presentation.dishMargin')}
        one={t('presentation.dishIngredientOne')}
        two={t('presentation.dishIngredientTwo')}
        three={t('presentation.dishIngredientThree')}
      />
    ),
    seconds: BASE,
  },
  {
    id: 'revenue',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.revenueTitle',
    leadKey: 'presentation.revenueBody',
    figure: (t) => (
      <RevenueVsCostFigure
        title={t('presentation.revenueSvgTitle')}
        sales={t('presentation.revenueLegendSales')}
        costs={t('presentation.revenueLegendCosts')}
      />
    ),
    seconds: SHORT,
  },
  {
    id: 'staff',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.staffTitle',
    leadKey: 'presentation.staffBody',
    figure: (t) => (
      <RotaFigure
        title={t('presentation.staffSvgTitle')}
        costLabel={t('presentation.staffCostLabel')}
      />
    ),
    seconds: SHORT,
  },
  {
    id: 'tax',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.taxTitle',
    leadKey: 'presentation.taxBody',
    figure: (t) => (
      <TaxFigure
        title={t('presentation.taxSvgTitle')}
        setAside={t('presentation.taxSetAside')}
        due={t('presentation.taxDue')}
      />
    ),
    seconds: BASE,
  },
  {
    id: 'compliance',
    eyebrowKey: 'presentation.capabilitiesLabel',
    titleKey: 'presentation.complianceTitle',
    leadKey: 'presentation.complianceBody',
    figure: (t) => (
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
    ),
    seconds: BASE,
  },

  // ── 4. What changes day to day ────────────────────────────────────────────
  // Given three screens rather than one. This is the part an owner is actually
  // deciding on — everything before it is context — so it gets room to breathe
  // instead of six cards flashing past at once.
  {
    id: 'day-open',
    eyebrowKey: 'presentation.dayLabel',
    titleKey: 'presentation.dayTitle',
    leadKey: 'presentation.dayLead',
    seconds: SHORT,
  },
  {
    id: 'day-one',
    eyebrowKey: 'presentation.dayLabel',
    titleKey: 'presentation.dayTitle',
    points: [
      { titleKey: 'presentation.dayOneTitle', bodyKey: 'presentation.dayOneBody' },
      { titleKey: 'presentation.dayTwoTitle', bodyKey: 'presentation.dayTwoBody' },
      { titleKey: 'presentation.dayThreeTitle', bodyKey: 'presentation.dayThreeBody' },
    ],
    seconds: LONG,
  },
  {
    id: 'day-two',
    eyebrowKey: 'presentation.dayLabel',
    titleKey: 'presentation.dayTitle',
    points: [
      { titleKey: 'presentation.dayFourTitle', bodyKey: 'presentation.dayFourBody' },
      { titleKey: 'presentation.dayFiveTitle', bodyKey: 'presentation.dayFiveBody' },
      { titleKey: 'presentation.daySixTitle', bodyKey: 'presentation.daySixBody' },
    ],
    seconds: LONG,
  },

  // ── 5. The lines to remember ──────────────────────────────────────────────
  {
    id: 'takeaway',
    eyebrowKey: 'presentation.takeawayLabel',
    titleKey: 'presentation.takeawayTitle',
    leadKey: 'presentation.takeawayLead',
    points: [
      { titleKey: 'presentation.takeawayOneTitle', bodyKey: 'presentation.takeawayOneBody' },
      { titleKey: 'presentation.takeawayTwoTitle', bodyKey: 'presentation.takeawayTwoBody' },
      { titleKey: 'presentation.takeawayThreeTitle', bodyKey: 'presentation.takeawayThreeBody' },
      { titleKey: 'presentation.takeawayFourTitle', bodyKey: 'presentation.takeawayFourBody' },
    ],
    seconds: LONG,
  },

  // ── Close ─────────────────────────────────────────────────────────────────
  {
    id: 'close',
    titleKey: 'presentation.closeTitle',
    leadKey: 'presentation.closeBody',
    points: [
      { titleKey: 'presentation.closePointOne' },
      { titleKey: 'presentation.closePointTwo' },
      { titleKey: 'presentation.closePointThree' },
      { titleKey: 'presentation.closePointFour' },
    ],
    seconds: LONG,
  },
];
