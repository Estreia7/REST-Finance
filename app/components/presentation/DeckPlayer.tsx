'use client';

import { useCallback, useEffect, useState } from 'react';
import { SLIDES } from './slides';
import type { Slide, T } from './slides';

/**
 * The deck that runs by itself on a television.
 *
 * Written for a room, not for a desk. Three things follow from that and shape
 * everything below.
 *
 * A television has no keyboard and no pointer — it has a remote with four
 * arrows and an OK button, which a TV browser delivers as ordinary arrow and
 * Enter keydowns. So every control is reachable from those five keys, and none
 * of them needs a cursor. Nothing here is behind a hover.
 *
 * It is read from four metres away. Type is sized in viewport units rather
 * than pixels so a 55-inch screen and a laptop both get proportionate text,
 * and the whole slide is built to fit one screen with no scrolling: a
 * television cannot scroll, so anything that overflows is simply lost.
 *
 * Nobody is holding it. It advances on its own, loops at the end, and keeps
 * the screen awake — a deck that pauses on a black screensaver halfway through
 * a meeting is worse than no deck.
 */

/** How often the progress bar is repainted. Smooth enough, cheap enough. */
const TICK_MS = 100;

/** After this long with no key pressed, the on-screen controls fade away. */
const IDLE_MS = 4000;

type Props = {
  t: T;
  /** Drawn in the corner so a room knows which deck is running. */
  brand: string;
};

export default function DeckPlayer({ t, brand }: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  /** 0 to 1 through the current slide. Drives the progress bar. */
  const [progress, setProgress] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [helpOpen, setHelpOpen] = useState(true);

  const slide: Slide = SLIDES[index];
  const total = SLIDES.length;

  // ── Movement ───────────────────────────────────────────────────────────────

  const goTo = useCallback((next: number) => {
    // Wraps in both directions: the deck is a loop, and someone pressing left
    // on the first screen means "the last one", not "nothing happens".
    setIndex(((next % total) + total) % total);
    setProgress(0);
  }, [total]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);

  // ── The clock that advances the deck ──────────────────────────────────────

  useEffect(() => {
    if (!playing || helpOpen) return;

    // Timed against the wall clock rather than by counting ticks: a television
    // browser throttles timers when it feels like it, and counting ticks made
    // a 12-second slide hold for twenty.
    const startedAt = Date.now();
    const holdMs = slide.seconds * 1000;

    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= holdMs) {
        setProgress(0);
        setIndex((i) => (i + 1) % total);
      } else {
        setProgress(elapsed / holdMs);
      }
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [playing, helpOpen, index, slide.seconds, total]);

  // ── The remote ────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Any key at all brings the controls back, so a remote press always has
      // a visible effect even when it does not move the deck.
      setControlsVisible(true);

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case 'MediaTrackNext':
          e.preventDefault();
          if (helpOpen) { setHelpOpen(false); return; }
          next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'MediaTrackPrevious':
          e.preventDefault();
          if (helpOpen) { setHelpOpen(false); return; }
          previous();
          break;
        case 'Enter':
        case ' ':
        case 'MediaPlayPause':
          e.preventDefault();
          if (helpOpen) { setHelpOpen(false); return; }
          setPlaying((p) => !p);
          break;
        case 'Home':
          e.preventDefault();
          goTo(0);
          break;
        case 'Escape':
        case 'GoBack':
        case 'BrowserBack':
          // The Back button on a remote. It closes the help card rather than
          // leaving the page, which is never what was meant. webOS reports
          // this as Escape on some sets and as a named key on others, so all
          // three spellings are handled.
          if (helpOpen) { e.preventDefault(); setHelpOpen(false); }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, previous, goTo, helpOpen]);

  // ── Controls fade when nobody is touching anything ────────────────────────

  useEffect(() => {
    if (!controlsVisible || helpOpen) return;
    const id = window.setTimeout(() => setControlsVisible(false), IDLE_MS);
    return () => window.clearTimeout(id);
  }, [controlsVisible, helpOpen, index]);

  // ── Keep the television awake ─────────────────────────────────────────────

  useEffect(() => {
    // Not supported everywhere, and refused outright by some TV browsers. A
    // deck that still runs without it is fine; one that throws on an
    // unsupported browser is not.
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const wakeLock = (navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
        if (!wakeLock) return;
        const held = await wakeLock.request('screen');
        if (cancelled) { void held.release(); return; }
        lock = held;
      } catch {
        // Denied or unsupported. Nothing to do and nothing worth saying.
      }
    };

    void request();
    // The lock is dropped whenever the tab is hidden, so it is taken again on
    // the way back — otherwise the screen sleeps after the first switch away.
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const hasFigure = Boolean(slide.figure);
  const points = slide.points ?? [];

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-background text-foreground select-none"
      // A tap anywhere on a touch-capable TV or tablet reveals the controls,
      // for remotes whose OK button the browser does not report as a key.
      onPointerDown={() => setControlsVisible(true)}
      // An LG Magic Remote puts a cursor on screen when it is waved, and that
      // arrives as pointer movement rather than as a key. Without this, waving
      // the remote moved a cursor over controls that had already faded out.
      onPointerMove={() => setControlsVisible(true)}
    >
      {/* Progress along the top: the one piece of chrome that never fades,
          because a room reads "how much is left" from it at a glance. */}
      <div className="absolute top-0 inset-x-0 h-1.5 bg-border-subtle/40 z-30">
        <div
          className="h-full bg-primary transition-[width] duration-100 ease-linear"
          style={{ width: `${((index + progress) / total) * 100}%` }}
        />
      </div>

      {/* The slide. Keyed by id so React remounts it and the entrance
          animation plays again on every move. */}
      <section
        key={slide.id}
        // Padded in viewport units rather than pixels so the margin scales
        // with the screen, and generously at the sides: a television crops a
        // few percent off each edge (overscan), and anything closer in than
        // this risks being cut off on a set that does it.
        className="absolute inset-0 flex flex-col justify-center px-[6vw] py-[9vh] animate-fade-up-1"
        aria-live="polite"
      >
        <div
          className={
            hasFigure
              ? 'w-full max-w-[1800px] mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-[4vw] items-center'
              : 'w-full max-w-[1700px] mx-auto'
          }
        >
          {/* Words */}
          <div className="space-y-[2.2vh] min-w-0">
            {/* The opening screen's eyebrow is the brand, which is already
                drawn in the corner. Printing it twice reads as a mistake. */}
            {slide.eyebrowKey && slide.eyebrowKey !== 'presentation.heroEyebrow' && (
              <p className="section-label text-primary-ink text-[clamp(0.7rem,1.1vw,1.1rem)] tracking-[0.18em]">
                {t(slide.eyebrowKey)}
              </p>
            )}

            <h1 className="font-display font-black leading-[1.05] tracking-tight text-balance text-[clamp(1.9rem,4.2vw,4.4rem)]">
              {t(slide.titleKey)}
            </h1>

            {slide.leadKey && (
              <p className="text-muted-foreground leading-relaxed max-w-[38ch] text-[clamp(0.95rem,1.55vw,1.7rem)]">
                {t(slide.leadKey)}
              </p>
            )}

            {points.length > 0 && !hasFigure && (
              // Three claims go in three columns and four in two rows of two.
              // Putting three into a two-column grid leaves a hole in the
              // corner, which on a 55-inch screen reads as a missing card.
              <ul
                className={`grid gap-[1.6vw] pt-[1.5vh] ${
                  points.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                }`}
              >
                {points.map((p) => (
                  <li
                    key={p.titleKey}
                    className="card-glass p-[1.6vw] space-y-[0.6vh] min-w-0"
                  >
                    <h2 className="font-semibold text-foreground text-[clamp(0.95rem,1.55vw,1.7rem)]">
                      {t(p.titleKey)}
                    </h2>
                    {p.bodyKey && (
                      <p className="text-muted-foreground leading-relaxed text-[clamp(0.8rem,1.15vw,1.25rem)]">
                        {t(p.bodyKey)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {points.length > 0 && hasFigure && (
              <ul className="space-y-[1.4vh] pt-[1vh]">
                {points.map((p) => (
                  <li key={p.titleKey} className="flex items-start gap-[1vw]">
                    <Tick />
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground text-[clamp(0.9rem,1.4vw,1.5rem)]">
                        {t(p.titleKey)}
                      </span>
                      {p.bodyKey && (
                        <p className="text-muted-foreground leading-relaxed text-[clamp(0.78rem,1.05vw,1.15rem)]">
                          {t(p.bodyKey)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Drawing */}
          {hasFigure && (
            <div className="rounded-2xl bg-surface border border-border-subtle p-[2.5vw]">
              {slide.figure!(t)}
            </div>
          )}
        </div>
      </section>

      {/* Brand mark, so a screen left running still says whose deck it is */}
      <p className="absolute top-[3vh] left-[5vw] section-label text-primary-ink text-[clamp(0.65rem,0.95vw,1rem)] tracking-[0.2em] z-20 pointer-events-none">
        {brand}
      </p>

      {/* Controls. Present for a pointer, but never required: the remote does
          everything they do. They fade after a few idle seconds so a deck left
          running is just the deck. */}
      <div
        className={`absolute bottom-[3vh] inset-x-0 px-[5vw] flex items-center justify-between gap-4 z-20 transition-opacity duration-500 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className="text-muted-foreground tabular-nums text-[clamp(0.7rem,1vw,1.05rem)]">
          {t('presentation.tvSlideOf')
            .replace('{current}', String(index + 1))
            .replace('{total}', String(total))}
        </p>

        <div className="flex items-center gap-[0.8vw]">
          <ControlButton onClick={previous} label={t('presentation.tvPrevious')}>
            <path d="M15 6 L9 12 l6 6" />
          </ControlButton>

          <ControlButton
            onClick={() => setPlaying((p) => !p)}
            label={playing ? t('presentation.tvPause') : t('presentation.tvPlay')}
          >
            {playing
              ? <><path d="M9.5 7 v10" /><path d="M14.5 7 v10" /></>
              : <path d="M9 6.5 L17 12 L9 17.5 Z" />}
          </ControlButton>

          <ControlButton onClick={next} label={t('presentation.tvNext')}>
            <path d="M9 6 l6 6 -6 6" />
          </ControlButton>

          <ControlButton onClick={() => { goTo(0); setPlaying(true); }} label={t('presentation.tvRestart')}>
            <path d="M4.5 12 a7.5 7.5 0 1 0 2.4 -5.5" />
            <path d="M4 5 v4 h4" />
          </ControlButton>
        </div>
      </div>

      {/* Dots, for a sense of length. Decorative: the count above says it in
          words for anyone who cannot see them. */}
      <div
        className={`absolute bottom-[1.2vh] inset-x-0 flex justify-center gap-[0.5vw] z-20 transition-opacity duration-500 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      >
        {SLIDES.map((s, i) => (
          <span
            key={s.id}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'w-6 bg-primary' : 'w-1.5 bg-border-subtle'
            }`}
          />
        ))}
      </div>

      {/* How to drive it. Shown once at the start, dismissed by any key on the
          remote — including the very first press of "next", which then does not
          also skip a slide. */}
      {helpOpen && (
        <div className="absolute inset-0 z-40 bg-background/92 backdrop-blur-sm flex items-center justify-center px-[6vw]">
          <div className="card-glass p-[3vw] max-w-[60ch] space-y-[2vh] text-center">
            <h2 className="font-display font-black tracking-tight text-[clamp(1.4rem,2.6vw,2.6rem)]">
              {t('presentation.tvHelpTitle')}
            </h2>
            <p className="text-muted-foreground leading-relaxed text-[clamp(0.9rem,1.4vw,1.4rem)]">
              {t('presentation.tvHelpKeys')}
            </p>
            <p className="text-muted-foreground leading-relaxed text-[clamp(0.9rem,1.4vw,1.4rem)]">
              {t('presentation.tvHelpAuto')}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setHelpOpen(false)}
              className="cta-button text-[clamp(0.9rem,1.3vw,1.3rem)] px-[2.5vw] py-[1.2vh] mt-[1vh]"
            >
              {t('presentation.tvHelpDismiss')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * A control on the deck. Sized well past the usual touch target because it is
 * also aimed at with a remote's cursor on some televisions, and labelled
 * because the icon alone says nothing to a screen reader.
 */
function ControlButton({
  onClick, label, children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-[clamp(2.75rem,3.4vw,3.6rem)] h-[clamp(2.75rem,3.4vw,3.6rem)] rounded-full border border-border-subtle bg-surface/90 text-foreground flex items-center justify-center transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[55%] h-[55%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/** The amber tick beside a claim. Ornamental. */
function Tick() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-[clamp(1rem,1.5vw,1.6rem)] h-[clamp(1rem,1.5vw,1.6rem)] shrink-0 mt-[0.4vh] text-primary"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.2" fill="currentColor" opacity={0.15} />
      <path
        d="M4.8 8.2 l2.2 2.2 4.2 -4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
