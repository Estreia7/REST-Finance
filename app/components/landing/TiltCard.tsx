'use client';

import { useRef, useCallback, type ReactNode } from 'react';

/**
 * A card that leans toward the cursor.
 *
 * The rotation is written straight to the DOM node in the pointer handler
 * rather than held in React state: state would re-render the tree on every
 * mouse move, which stutters as soon as several cards are on screen.
 *
 * Only fires for real pointers (hover-capable devices), and the reduced-motion
 * override in globals.css flattens it for anyone who asks.
 */
export default function TiltCard({
  children,
  className = '',
  /** Maximum lean, in degrees. Past about 10 it stops reading as depth. */
  max = 7,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse') return;
      const el = ref.current;
      if (!el) return;

      cancelAnimationFrame(frame.current);
      const { clientX, clientY } = e;

      frame.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        // Cursor position within the card, as -0.5 to 0.5 on each axis.
        const px = (clientX - r.left) / r.width - 0.5;
        const py = (clientY - r.top) / r.height - 0.5;

        // Y follows the horizontal axis; X is inverted so the card tips away
        // from the cursor rather than toward it, which is what reads as tilt.
        el.style.transform =
          `rotateY(${px * max * 2}deg) rotateX(${-py * max * 2}deg) translateZ(0)`;
      });
    },
    [max]
  );

  const handleLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (el) el.style.transform = '';
  }, []);

  return (
    <div className="tilt-scene">
      <div
        ref={ref}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        className={`tilt-card ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
