'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import {
  pickQuoteIndex,
  quoteAt,
  type WelcomeAudience,
} from '@/lib/welcome-quotes';

/**
 * The screen shown between signing in and the dashboard being usable.
 *
 * It exists because the dashboard's first paint needs eight round trips, and
 * a bare spinner makes that wait feel like a fault. Rather than hide the
 * delay, this uses it: a greeting by first name, one line worth reading, and
 * a bar that says how much longer.
 *
 * Timing is honest. The bar advances on a fixed schedule to MIN_MS, but the
 * splash only leaves once the caller reports its data is in (`ready`), so the
 * bar never reaches the end while work is still outstanding. When the data
 * arrives late the bar holds just short of full instead of jumping backwards.
 */

/** Floor for the whole splash: long enough to read the line, short enough not to annoy. */
const MIN_MS = 3200;
/** Length of the fade-out once both the floor and the data are done. */
const EXIT_MS = 520;
/** Where the bar waits when the data is still loading past the floor. */
const STALL_AT = 0.94;

interface WelcomeSplashProps {
  audience: WelcomeAudience;
  /** Greeted by first name. Empty greets without a name rather than a placeholder. */
  name: string;
  /** Flip to true once the page behind the splash has its data. */
  ready: boolean;
  onDone: () => void;
}

export default function WelcomeSplash({ audience, name, ready, onDone }: WelcomeSplashProps) {
  const { language, t } = useLanguage();

  // Drawn once on mount: re-rolling on a language change would swap the line
  // out from under someone mid-read.
  const quoteIndex = useMemo(() => pickQuoteIndex(audience), [audience]);
  const quote = quoteAt(audience, language, quoteIndex);

  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const startedAt = useRef(Date.now());
  const doneRef = useRef(false);

  // Respect a reduced-motion preference by shortening the wait to almost
  // nothing: the greeting still registers, but nothing animates for seconds.
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // ── The bar ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt.current;
      const linear = Math.min(elapsed / MIN_MS, 1);
      // Ease out, so the bar moves confidently at first and settles at the end
      // rather than crawling the whole way at one speed.
      const eased = 1 - Math.pow(1 - linear, 2.2);
      setProgress(ready ? eased : Math.min(eased, STALL_AT));
      if (linear < 1 || !ready) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, reducedMotion]);

  // ── Leaving ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || doneRef.current) return;

    const floor = reducedMotion ? 0 : MIN_MS;
    const remaining = Math.max(floor - (Date.now() - startedAt.current), 0);

    const toExit = setTimeout(() => {
      setLeaving(true);
      const toDone = setTimeout(() => {
        doneRef.current = true;
        onDone();
      }, reducedMotion ? 0 : EXIT_MS);
      return () => clearTimeout(toDone);
    }, remaining);

    return () => clearTimeout(toExit);
  }, [ready, reducedMotion, onDone]);

  const greeting = name
    ? `${t('welcome.greeting')}, ${name}`
    : t('welcome.greetingNoName');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background px-6"
      style={{
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'scale(1.015)' : 'scale(1)',
        transition: reducedMotion
          ? 'none'
          : `opacity ${EXIT_MS}ms ease-out, transform ${EXIT_MS}ms ease-out`,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Warm amber wash behind the mark, so the screen is not a flat panel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 32%, hsl(var(--primary) / 0.13), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-lg text-center">
        <WelcomeMark audience={audience} reducedMotion={reducedMotion} />

        <h1
          className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-8 welcome-rise"
          style={{ animationDelay: reducedMotion ? '0ms' : '120ms' }}
        >
          {greeting}
        </h1>

        <p
          className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground welcome-rise"
          style={{ animationDelay: reducedMotion ? '0ms' : '340ms' }}
        >
          {quote}
        </p>

        {/* Progress */}
        <div
          className="mx-auto mt-10 w-full max-w-xs welcome-rise"
          style={{ animationDelay: reducedMotion ? '0ms' : '520ms' }}
        >
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={t('welcome.loading')}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${progress * 100}%`,
                transition: reducedMotion ? 'none' : 'width 140ms linear',
              }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('welcome.loading')}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The animated mark.
 *
 * Two variants of one idea, so both audiences get a screen that belongs to
 * them without maintaining two unrelated illustrations:
 *
 *   - owner — a cloche lifting off a rising bar chart: the numbers under the
 *             service.
 *   - admin — the same chart seen as a platform, with three client nodes
 *             orbiting a central mark.
 *
 * Drawn inline rather than loaded as a file: it is themed with the design
 * tokens, and a splash screen must not wait on a second request.
 */
function WelcomeMark({
  audience,
  reducedMotion,
}: {
  audience: WelcomeAudience;
  reducedMotion: boolean;
}) {
  const bars =
    audience === 'owner'
      ? [
          { x: 34, h: 20 },
          { x: 52, h: 32 },
          { x: 70, h: 44 },
          { x: 88, h: 58 },
        ]
      : [
          { x: 40, h: 24 },
          { x: 58, h: 40 },
          { x: 76, h: 54 },
        ];

  return (
    <svg
      viewBox="0 0 140 120"
      className="mx-auto h-32 w-36 sm:h-36 sm:w-40"
      role="img"
      aria-hidden="true"
      fill="none"
    >
      {/* Baseline the bars stand on. */}
      <line
        x1="22"
        y1="96"
        x2="118"
        y2="96"
        stroke="hsl(var(--border))"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {bars.map((bar, i) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={96 - bar.h}
          width="12"
          height={bar.h}
          rx="3.5"
          fill={i === bars.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.28)'}
          className={reducedMotion ? undefined : 'welcome-bar'}
          style={
            reducedMotion
              ? undefined
              : {
                  // Grow from the baseline, one after another.
                  transformOrigin: `${bar.x + 6}px 96px`,
                  animationDelay: `${140 + i * 130}ms`,
                }
          }
        />
      ))}

      {audience === 'owner' ? (
        <>
          {/* Cloche: dome plus handle, floating above the chart. */}
          <g
            className={reducedMotion ? undefined : 'welcome-lift'}
            style={reducedMotion ? undefined : { animationDelay: '620ms' }}
          >
            <path
              d="M30 44a40 40 0 0 1 80 0"
              stroke="hsl(var(--accent))"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            <line
              x1="24"
              y1="44"
              x2="116"
              y2="44"
              stroke="hsl(var(--accent))"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="70" cy="16" r="4.5" fill="hsl(var(--primary))" />
          </g>

          {/* Steam, rising and fading. */}
          {[56, 70, 84].map((x, i) => (
            <path
              key={x}
              d={`M${x} 34c3-4-3-7 0-11`}
              stroke="hsl(var(--primary) / 0.5)"
              strokeWidth="2"
              strokeLinecap="round"
              className={reducedMotion ? undefined : 'welcome-steam'}
              style={reducedMotion ? undefined : { animationDelay: `${900 + i * 260}ms` }}
            />
          ))}
        </>
      ) : (
        <>
          {/* Platform ring with three client nodes on it. */}
          <circle
            cx="70"
            cy="52"
            r="32"
            stroke="hsl(var(--border))"
            strokeWidth="2"
            strokeDasharray="4 7"
            className={reducedMotion ? undefined : 'welcome-orbit'}
            style={{ transformOrigin: '70px 52px' }}
          />
          {[
            { cx: 70, cy: 20 },
            { cx: 97.7, cy: 68 },
            { cx: 42.3, cy: 68 },
          ].map((node, i) => (
            <circle
              key={`${node.cx}-${node.cy}`}
              cx={node.cx}
              cy={node.cy}
              r="5"
              fill="hsl(var(--primary))"
              className={reducedMotion ? undefined : 'welcome-node'}
              style={reducedMotion ? undefined : { animationDelay: `${620 + i * 200}ms` }}
            />
          ))}
          {/* Shield at the centre: the admin watches over the platform. */}
          <path
            d="M70 38l13 5v9c0 8-5.4 14.2-13 16.5C62.4 66.2 57 60 57 52v-9l13-5z"
            fill="hsl(var(--accent))"
            className={reducedMotion ? undefined : 'welcome-lift'}
            style={reducedMotion ? undefined : { animationDelay: '480ms' }}
          />
          <path
            d="M64.5 52.5l4 4 7.5-8"
            stroke="hsl(var(--primary))"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={reducedMotion ? undefined : 'welcome-check'}
          />
        </>
      )}
    </svg>
  );
}
