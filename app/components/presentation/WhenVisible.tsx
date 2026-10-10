'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Plays its children's entrance animations once, when the element scrolls
 * into view.
 *
 * The motion in the presentation explains a mechanic — a needle settling, a
 * waterfall falling, a bar filling — so it should run when the owner is
 * looking, not when the page loads two screens above. The observer waits for
 * about a third of the element to be visible, then adds `is-visible` and
 * stops watching: the animation plays once, never again on scroll-back.
 *
 * Under prefers-reduced-motion the class is never added. The CSS keeps every
 * animated element in its final state in that case, so nothing is hidden.
 *
 * On the television deck each slide remounts when it changes, so a figure
 * inside one of these plays again on every move without further work.
 */
export default function WhenVisible({
  children,
  className = '',
  threshold = 0.35,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlay(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} className={`${className} ${play ? 'is-visible' : ''}`}>
      {children}
    </div>
  );
}
