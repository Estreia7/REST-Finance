'use client';

import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { TOUR_STEPS, type TourStep } from '@/lib/tour';

/**
 * The first-run walkthrough.
 *
 * Points at real controls rather than describing them: the owner is learning
 * where things are, and a dialog in the middle of the screen teaches nothing
 * about where to click afterwards.
 *
 * Two things make it robust enough to leave running as the app changes. Steps
 * are found by `data-tour` attributes, so restyling or moving a button cannot
 * silently break them; and a step whose anchor is not on screen — a panel
 * hidden at this width, a feature this restaurant has not got — is skipped
 * rather than pointing at empty space.
 */

interface WalkthroughProps {
  /** Lets the tour move to the tab a step belongs to. */
  onNavigate: (tab: string) => void;
  onClose: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Space between the highlight and the bubble, and from the viewport edge. */
const GAP = 12;
const MARGIN = 12;
const BUBBLE_WIDTH = 300;

export default function Walkthrough({ onNavigate, onClose }: WalkthroughProps) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const step: TourStep | undefined = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  /** Marks the tour as seen, then hands control back. Never blocks closing. */
  const finish = useCallback(() => {
    void fetch('/api/tour', { method: 'POST' }).catch(() => {
      // Worst case it is offered again next time, which is better than
      // trapping someone in a walkthrough because a request failed.
    });
    onClose();
  }, [onClose]);

  // The step may live on another tab, so switch before measuring.
  useEffect(() => {
    if (step?.tab) onNavigate(step.tab);
  }, [step?.tab, onNavigate]);

  /**
   * Finds the anchor and measures it.
   *
   * Runs in a layout effect and then again on the next frame: switching tabs
   * re-renders the page, and measuring before that paints gives the previous
   * tab's geometry.
   */
  useLayoutEffect(() => {
    if (!step) return;

    if (!step.anchor) {
      setBox(null);
      return;
    }

    let frame = 0;

    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (!el) {
        // Not on this screen — skip rather than point at nothing. Going
        // forwards from a missing anchor must not walk backwards, so the last
        // step closes instead.
        setBox(null);
        if (!isLast) setIndex((i) => i + 1);
        else finish();
        return;
      }

      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    frame = requestAnimationFrame(measure);

    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [step, isLast, finish]);

  // Escape leaves, like any other dismissible layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  if (!step) return null;

  const next = () => (isLast ? finish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  const bubble = bubblePosition(box, step.placement);

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t('tour.aria')}>
      {/*
        Four panels around the anchor rather than one overlay with a hole:
        a cut-out needs SVG masking or box-shadow tricks that behave badly
        across browsers, and this keeps the highlighted control genuinely
        visible and un-dimmed.
      */}
      {box ? (
        <>
          <div className="absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top - 4) }} onClick={finish} />
          <div className="absolute bg-black/55" style={{ top: box.top + box.height + 4, left: 0, right: 0, bottom: 0 }} onClick={finish} />
          <div className="absolute bg-black/55" style={{ top: box.top - 4, left: 0, width: Math.max(0, box.left - 4), height: box.height + 8 }} onClick={finish} />
          <div className="absolute bg-black/55" style={{ top: box.top - 4, left: box.left + box.width + 4, right: 0, height: box.height + 8 }} onClick={finish} />
          <div
            className="absolute rounded-xl ring-2 ring-primary pointer-events-none"
            style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55" onClick={finish} />
      )}

      <div
        className="absolute w-[300px] max-w-[calc(100vw-24px)] rounded-2xl bg-card text-card-foreground
                   border border-border shadow-xl p-4"
        style={bubble}
      >
        <button
          type="button"
          onClick={finish}
          className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label={t('tour.skip')}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">
          {index + 1}/{TOUR_STEPS.length}
        </p>
        <h3 className="font-bold text-foreground mb-1.5 pr-6">{t(step.titleKey)}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{t(step.bodyKey)}</p>

        <div className="flex items-center gap-2 mt-4">
          {index > 0 && (
            <button
              type="button"
              onClick={back}
              className="cta-button-secondary !py-1.5 !px-2.5 !text-xs"
              aria-label={t('tour.back')}
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}

          <button type="button" onClick={finish} className="text-xs font-medium text-muted-foreground hover:text-foreground px-1">
            {t('tour.skip')}
          </button>

          <button type="button" onClick={next} className="cta-button !py-1.5 !px-3 !text-xs ml-auto">
            {isLast ? t('tour.finish') : t('tour.next')}
            {!isLast && <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Places the bubble beside the anchor, clamped to the viewport.
 *
 * Preference is a hint, not a promise: a step that asks for `right` on a phone
 * would push the bubble off-screen, so the result is always clamped and, when
 * there is no room on the requested side, flipped to the other one.
 */
function bubblePosition(box: Box | null, placement?: TourStep['placement']): React.CSSProperties {
  if (typeof window === 'undefined' || !box) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Tall enough for the longest step; only used to keep the bubble on screen.
  const height = 190;

  let top: number;
  let left: number;

  switch (placement) {
    case 'right':
      left = box.left + box.width + GAP;
      top = box.top;
      if (left + BUBBLE_WIDTH > vw - MARGIN) left = box.left - BUBBLE_WIDTH - GAP;
      break;
    case 'left':
      left = box.left - BUBBLE_WIDTH - GAP;
      top = box.top;
      if (left < MARGIN) left = box.left + box.width + GAP;
      break;
    case 'top':
      top = box.top - height - GAP;
      left = box.left + box.width / 2 - BUBBLE_WIDTH / 2;
      if (top < MARGIN) top = box.top + box.height + GAP;
      break;
    default:
      top = box.top + box.height + GAP;
      left = box.left + box.width / 2 - BUBBLE_WIDTH / 2;
      if (top + height > vh - MARGIN) top = box.top - height - GAP;
  }

  return {
    top: Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - height - MARGIN)),
    left: Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - BUBBLE_WIDTH - MARGIN)),
  };
}
