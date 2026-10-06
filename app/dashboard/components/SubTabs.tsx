'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * The row of sub-tabs under a main tab.
 *
 * Analytics has eight of these and they do not fit on a phone. They used to
 * sit in a `w-fit` row with no overflow set, so the row grew past the screen
 * and simply could not be scrolled: the last tabs were unreachable, and the
 * one cut off at the edge gave no sign that anything followed it.
 *
 * So the row scrolls, and three things make that scroll discoverable rather
 * than something the owner has to guess at:
 *
 *   - the selected tab scrolls itself into view, so arriving on a tab that
 *     lives off-screen does not look like nothing happened
 *   - a fade on whichever edge has more to show, which is the only honest
 *     signal — it appears because content is there, and goes when it is not
 *   - the scrollbar is hidden, because a native one on a phone is a grey
 *     slab over the tabs and on a desktop it steals 15px of the row's height
 *
 * On a desktop the row usually fits and none of this shows.
 */

export interface SubTab<T extends string> {
  value: T;
  label: string;
  /** Marks the anchor the walkthrough points at. */
  tour?: string;
}

interface Props<T extends string> {
  tabs: Array<SubTab<T>>;
  active: T;
  onChange: (value: T) => void;
  /** Names the row for a screen reader, e.g. "Análises". */
  label: string;
}

export default function SubTabs<T extends string>({ tabs, active, onChange, label }: Props<T>) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // A couple of pixels of slack: sub-pixel layout means scrollLeft rarely
    // reaches scrollWidth - clientWidth exactly, and a fade that never quite
    // goes away looks like a rendering fault.
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;

    el.addEventListener('scroll', measure, { passive: true });
    // Rotating the phone or opening the keyboard changes what fits.
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, tabs.length]);

  // Bring the selected tab into view. This matters when the tab was chosen
  // from somewhere else — the walkthrough, or a card on the dashboard — and
  // it happens to live off the right-hand edge.
  useEffect(() => {
    const el = scroller.current;
    const current = el?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || !current) return;

    const left = current.offsetLeft;
    const right = left + current.offsetWidth;
    if (left < el.scrollLeft) {
      el.scrollTo({ left: Math.max(0, left - 12), behavior: 'smooth' });
    } else if (right > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: right - el.clientWidth + 12, behavior: 'smooth' });
    }
  }, [active]);

  const fade =
    'pointer-events-none absolute top-0 bottom-0 w-8 z-10 transition-opacity duration-200';

  return (
    <div className="relative">
      <div
        ref={scroller}
        role="tablist"
        aria-label={label}
        // `no-scrollbar` is the project's own utility; the fades carry the
        // affordance instead. `snap` stops a flick leaving a tab half-cut.
        className="flex gap-1 p-1 bg-muted rounded-xl border border-border-subtle
                   overflow-x-auto no-scrollbar snap-x snap-mandatory
                   md:w-fit md:overflow-visible"
      >
        {tabs.map((tab) => {
          const selected = tab.value === active;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              data-active={selected}
              data-tour={tab.tour}
              onClick={() => onChange(tab.value)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0
                          snap-start transition-all focus-visible:outline-none
                          focus-visible:ring-2 focus-visible:ring-ring ${
                            selected
                              ? 'gradient-bg text-white shadow-glow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* From the row's own background, so the tabs look like they pass under
          the edge rather than meeting a grey block. */}
      <span
        className={`${fade} left-0 rounded-l-xl bg-gradient-to-r from-muted to-transparent ${
          edges.left ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      <span
        className={`${fade} right-0 rounded-r-xl bg-gradient-to-l from-muted to-transparent ${
          edges.right ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
    </div>
  );
}
