'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DRAG_START, deckPose, isDrawn, isThrow, tiltFor, wrap } from '@/components/ui/card-deck-utils';

/**
 * A pile of cards. Throw the top one in any direction and it goes to the bottom
 * of the pile, with the next already waiting. The buttons and the arrow keys do
 * the same throw; going back pulls the last card up again.
 *
 * It never moves by itself: what is on these cards is being read.
 *
 * A press only becomes a drag once it travels, so a tap still reaches whatever
 * the card holds.
 */

interface Flight {
  i: number;
  x: number;
  y: number;
  r: number;
  mode: 'drag' | 'fly' | 'snap';
}

export interface CardDeckCarouselProps {
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** Only the top card is live: the others are scenery and hold nothing to press. */
  renderCard: (index: number, isTop: boolean) => ReactNode;
  /** The name of the pile, for a screen reader. */
  label: string;
  /** Where the top card is in the pile: "1 de 4". */
  position: string;
  previousLabel: string;
  nextLabel: string;
  /** The largest tilt of the cards behind, in degrees. */
  scatter?: number;
  /** CSS aspect-ratio of a card. */
  aspect?: string;
  className?: string;
}

const FLY_MS = 430;
const REDUCED_MS = 200;

export default function CardDeckCarousel({
  count, index, onIndexChange, renderCard, label, position, previousLabel, nextLabel,
  scatter = 3.5, aspect = '3 / 4', className,
}: CardDeckCarouselProps) {
  const top = wrap(index, count);
  const reduce = !!useReducedMotion();
  const [flight, setFlight] = useState<Flight | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const width = () => deckRef.current?.offsetWidth || 400;
  const landAfter = (ms: number, next: number) => {
    timer.current = window.setTimeout(() => {
      setFlight(null);
      onIndexChange(next);
      busy.current = false;
    }, ms);
  };

  const throwTop = useCallback((dirX: number, fromX = 0, fromY = 0) => {
    if (busy.current || count < 2) return;
    busy.current = true;
    const side = dirX >= 0 ? 1 : -1;
    setFlight({ i: top, x: fromX + side * width() * 1.25, y: fromY * 1.4 - 40, r: side * 16, mode: 'fly' });
    landAfter(reduce ? REDUCED_MS : FLY_MS, wrap(top + 1, count));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, top, reduce, onIndexChange]);

  const pullBack = useCallback(() => {
    if (busy.current || count < 2) return;
    busy.current = true;
    const i = wrap(top - 1, count);
    setFlight({ i, x: -width() * 1.25, y: -40, r: -16, mode: 'snap' });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setFlight({ i, x: 0, y: 0, r: 0, mode: 'fly' });
      landAfter(reduce ? REDUCED_MS : FLY_MS, i);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, top, reduce, onIndexChange]);

  const press = useRef<null | { x: number; y: number; lastX: number; lastT: number; vx: number; dragging: boolean }>(null);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (busy.current || count < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: e.timeStamp, vx: 0, dragging: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      p.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    p.vx = 0.8 * ((e.clientX - p.lastX) / Math.max(1, e.timeStamp - p.lastT)) + 0.2 * p.vx;
    p.lastX = e.clientX;
    p.lastT = e.timeStamp;
    setFlight({ i: top, x: dx, y: dy, r: reduce ? 0 : dx * 0.05, mode: 'drag' });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p?.dragging) return;
    const dx = e.clientX - p.x;
    if (isThrow(dx, p.vx, width())) throwTop(dx, dx, e.clientY - p.y);
    else setFlight(null);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // The enlarged page is a portal: its keys bubble here without being in here.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.key === 'ArrowRight') throwTop(1);
    else if (e.key === 'ArrowLeft') pullBack();
    else return;
    e.preventDefault();
  };

  const pile = Array.from({ length: count }, (_, i) => i).filter((i) => isDrawn(wrap(i - top, count), count));

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={count > 1 ? 0 : undefined}
      onKeyDown={onKey}
      className={cn('rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      {/* Room above for the cards that show behind. */}
      <div ref={deckRef} className={cn('relative mx-auto w-full max-w-sm', count > 1 && 'mt-11')} style={{ aspectRatio: aspect }}>
        {pile.map((i) => {
          const depth = wrap(i - top, count);
          const isTop = depth === 0;
          const pose = deckPose(depth, tiltFor(i, scatter), reduce);
          const moving = flight?.i === i ? flight : null;
          return (
            <div
              key={i}
              aria-hidden={isTop ? undefined : true}
              onDragStart={(e) => e.preventDefault()}
              onPointerDown={isTop ? onDown : undefined}
              onPointerMove={isTop ? onMove : undefined}
              onPointerUp={isTop ? onUp : undefined}
              onPointerCancel={isTop ? onUp : undefined}
              className={cn(
                'absolute inset-0 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.08),0_24px_48px_-28px_rgba(0,0,0,.45)]',
                'origin-top will-change-transform motion-reduce:transition-opacity',
                moving?.mode === 'drag' || moving?.mode === 'snap'
                  ? 'transition-none'
                  : moving
                    ? 'transition-[transform,opacity] duration-[430ms] ease-[cubic-bezier(.3,.5,.3,1)]'
                    : 'transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]',
                isTop ? count > 1 && 'cursor-grab touch-pan-y active:cursor-grabbing' : 'pointer-events-none',
              )}
              style={{
                transform: moving
                  ? `translate(${moving.x}px, ${moving.y}px) rotate(${moving.r}deg)`
                  : `translateY(${pose.y}px) scale(${pose.scale}) rotate(${pose.rot.toFixed(2)}deg)`,
                zIndex: moving ? count + 1 : count - depth,
                opacity: moving ? 1 : pose.opacity,
                filter: moving || isTop ? undefined : `brightness(${pose.shade})`,
              }}
            >
              {renderCard(i, isTop)}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="mx-auto mt-3 flex w-full max-w-sm items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pullBack}
              aria-label={previousLabel}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border-subtle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">{position}</span>
          </div>
          <button
            type="button"
            onClick={() => throwTop(1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {nextLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{position}</span>
    </div>
  );
}
