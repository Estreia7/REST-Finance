'use client';

import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  /**
   * Underlines the trigger with a dotted rule. On a word in running text that
   * is the affordance; on a bare icon it just smudges the glyph, so the icon
   * triggers opt out.
   */
  underline?: boolean;
  /** Announced to screen readers when the trigger is an icon with no text. */
  label?: string;
}

interface Placement {
  /** Where the arrow points: the trigger's horizontal centre, in viewport px. */
  anchorX: number;
  /** The bubble's left edge, slid back inside the viewport when needed. */
  left: number;
  top: number;
  side: 'top' | 'bottom';
}

const GAP = 8;
const MARGIN = 8;

/**
 * The bubble is rendered into document.body with fixed positioning. Drawn
 * inside the trigger, it was clipped by any scrolling ancestor (the annual
 * table scrolls sideways) and covered by its sticky header.
 */
export default function Tooltip({ text, children, underline = true, label }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const describedBy = useId();

  // Measure before paint so the bubble never flashes in the wrong place.
  useLayoutEffect(() => {
    if (!show) {
      setPlacement(null);
      return;
    }

    const place = () => {
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;

      const rect = trigger.getBoundingClientRect();
      const box = bubble.getBoundingClientRect();
      const anchorX = rect.left + rect.width / 2;

      // Above by default; below when there is no room above.
      const side = rect.top - box.height - GAP < MARGIN ? 'bottom' : 'top';
      const top = side === 'top' ? rect.top - box.height - GAP : rect.bottom + GAP;

      const maxLeft = window.innerWidth - MARGIN - box.width;
      const left = Math.max(MARGIN, Math.min(anchorX - box.width / 2, maxLeft));

      setPlacement({ anchorX, left, top, side });
    };

    place();
    // The trigger can move under a fixed bubble: follow it.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [show, text]);

  // Escape closes it, the same as any other transient layer.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-block cursor-help rounded-sm
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onTouchStart={() => setShow(v => !v)}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-describedby={show ? describedBy : undefined}
    >
      <span
        className={
          underline
            ? 'border-b border-dotted border-muted-foreground/50 hover:border-primary/70 transition-colors'
            : ''
        }
      >
        {children}
      </span>
      {show &&
        createPortal(
          <span
            ref={bubbleRef}
            id={describedBy}
            role="tooltip"
            className={`fixed z-[110] px-3 py-2 text-xs font-normal leading-relaxed text-foreground bg-card-elevated border border-border rounded-lg shadow-modal whitespace-normal text-left max-w-[260px] w-max pointer-events-none transition-opacity duration-150
              ${placement ? 'opacity-100' : 'opacity-0'}
            `}
            style={{ top: placement?.top ?? 0, left: placement?.left ?? 0 }}
          >
            {text}
            {/* The arrow stays on the trigger even when the bubble slides, so
                it still points at the thing being explained. */}
            {placement && (
              <span
                className={`absolute w-2 h-2 bg-card-elevated border-border rotate-45
                  ${placement.side === 'top' ? 'top-full -mt-1 border-b border-r' : 'bottom-full -mb-1 border-t border-l'}
                `}
                style={{ left: placement.anchorX - placement.left - 4 }}
              />
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}
