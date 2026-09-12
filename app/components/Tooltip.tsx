'use client';

import { useState, useRef, useEffect, useId } from 'react';

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

export default function Tooltip({ text, children, underline = true, label }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  /**
   * How far to slide the bubble back towards the viewport, in pixels. A
   * tooltip on the first or last column of the annual table would otherwise
   * hang off the edge of the screen with half its sentence unreadable.
   */
  const [shift, setShift] = useState(0);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const describedBy = useId();

  useEffect(() => {
    if (!show || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    // Too close to the top of the viewport: flip below rather than clip.
    setPosition(rect.top < 96 ? 'bottom' : 'top');

    // Measure after the flip so the bubble is where it will finally sit.
    const bubble = bubbleRef.current;
    if (!bubble) return;

    const box = bubble.getBoundingClientRect();
    const margin = 8;
    let correction = 0;
    if (box.left < margin) correction = margin - box.left;
    else if (box.right > window.innerWidth - margin) {
      correction = window.innerWidth - margin - box.right;
    }
    setShift(correction);
  }, [show]);

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
      <span
        ref={bubbleRef}
        id={describedBy}
        role="tooltip"
        className={`absolute left-1/2 z-50 px-3 py-2 text-xs font-normal leading-relaxed text-foreground bg-card-elevated border border-border rounded-lg shadow-modal whitespace-normal text-left max-w-[260px] w-max pointer-events-none transition-opacity duration-200
          ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
          ${show ? 'opacity-100' : 'opacity-0'}
        `}
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
      >
        {text}
        {/* The arrow stays on the trigger even when the bubble slides, so it
            still points at the thing being explained. */}
        <span
          className={`absolute w-2 h-2 bg-card-elevated border-border rotate-45
            ${position === 'top' ? 'top-full -mt-1 border-b border-r' : 'bottom-full -mb-1 border-t border-l'}
          `}
          style={{ left: `calc(50% - ${shift}px)`, marginLeft: '-4px' }}
        />
      </span>
    </span>
  );
}
