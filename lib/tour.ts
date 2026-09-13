/**
 * The first-run walkthrough.
 *
 * Each step points at something real on the screen rather than describing it
 * in the abstract: an owner who has just been handed the app needs to know
 * where things are, and a dialog in the middle of the screen teaches nothing
 * about where to click afterwards.
 *
 * Steps are anchored by `data-tour` attributes, not by CSS classes or DOM
 * position, so restyling a button cannot silently break the tour. A step whose
 * anchor is missing — a panel that is not on this screen size, a feature the
 * restaurant does not have — is skipped rather than pointing at nothing.
 *
 * Keep it short. This runs the first time someone opens the app, when their
 * patience for being told things is at its lowest; the goal is to leave them
 * knowing where the day's takings go, not to describe every panel.
 */

export interface TourStep {
  /** Matches `data-tour="..."` in the markup. Empty for a centred step. */
  anchor?: string;
  /** Dictionary keys. Both languages are required — see CLAUDE.md. */
  titleKey: string;
  bodyKey: string;
  /**
   * The tab to be on for this step, so the tour can navigate there itself
   * rather than asking the owner to find it.
   */
  tab?: string;
  /** Where to put the bubble when there is room. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * The order matters: it follows the shape of the job, not the shape of the
 * menu. Takings first because that is the daily habit everything else depends
 * on, then costs, then what the two of them produce.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    titleKey: 'tour.welcome.title',
    bodyKey: 'tour.welcome.body',
  },
  {
    anchor: 'nav-dashboard',
    tab: 'dashboard',
    titleKey: 'tour.dashboard.title',
    bodyKey: 'tour.dashboard.body',
    placement: 'right',
  },
  {
    anchor: 'nav-revenue',
    tab: 'dashboard',
    titleKey: 'tour.revenue.title',
    bodyKey: 'tour.revenue.body',
    placement: 'right',
  },
  {
    // The one habit the rest of the app depends on, so it is shown where it
    // actually lives rather than described from the dashboard.
    anchor: 'quick-entry',
    tab: 'revenue',
    titleKey: 'tour.quickEntry.title',
    bodyKey: 'tour.quickEntry.body',
    placement: 'top',
  },
  {
    anchor: 'nav-costs',
    tab: 'revenue',
    titleKey: 'tour.costs.title',
    bodyKey: 'tour.costs.body',
    placement: 'right',
  },
  {
    anchor: 'nav-analytics',
    tab: 'revenue',
    titleKey: 'tour.analytics.title',
    bodyKey: 'tour.analytics.body',
    placement: 'right',
  },
  {
    anchor: 'nav-schedule',
    tab: 'revenue',
    titleKey: 'tour.schedule.title',
    bodyKey: 'tour.schedule.body',
    placement: 'right',
  },
  // "What's new" deliberately has no step: the unread dot explains it the
  // first time something lands there, and a step spent on it is a step not
  // spent on the daily habit. Its data-tour anchor is kept for when it is
  // worth reinstating.
  {
    titleKey: 'tour.done.title',
    bodyKey: 'tour.done.body',
  },
];

/**
 * Bumped when steps are added or meaningfully rewritten.
 *
 * Someone who finished the tour at version 2 and comes back to a version 3 app
 * is not shown the whole thing again — only a returning owner who has never
 * seen any of it gets the full run. The version is what lets us tell those
 * apart later without guessing.
 */
export const TOUR_VERSION = 1;
