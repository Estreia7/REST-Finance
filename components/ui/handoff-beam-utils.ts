'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface SpringState {
  x: number;
  v: number;
}

/** Longest step the spring takes at once: larger ones would overshoot. */
const SPRING_STEP = 1 / 120;

/** Moves a spring towards `target` by `dt` seconds, in place. */
export function stepSpring(state: SpringState, target: number, config: SpringConfig, dt: number): void {
  let left = dt;
  while (left > 0) {
    const step = Math.min(left, SPRING_STEP);
    const force = -config.stiffness * (state.x - target) - config.damping * state.v;
    state.v += (force / config.mass) * step;
    state.x += state.v * step;
    left -= step;
  }
}

function hash(n: number, seed: number): number {
  const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth noise from 0 to 1. The same seed always gives the same curve. */
export function valueNoise1D(seed: number): (x: number) => number {
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
  };
}

/** The element's size in CSS pixels, kept up to date. */
export function useElementSize(ref: RefObject<HTMLElement>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

/** Longest frame passed on, so coming back to a tab does not jump the motion. */
const MAX_FRAME_S = 0.05;

/**
 * Calls `frame` with the seconds since the last one, only while the element is on
 * screen and the tab is showing, so nothing is drawn that nobody can see.
 * An `fpsCap` of 0 means every frame.
 */
export function useVisibleLoop(
  ref: RefObject<HTMLElement>,
  frame: (dt: number) => void,
  { fpsCap = 0 }: { fpsCap?: number } = {},
): void {
  const latest = useRef(frame);
  useEffect(() => { latest.current = frame; });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const minGap = fpsCap > 0 ? 1 / fpsCap : 0;
    let onScreen = true;
    let handle = 0;
    let last = 0;

    const tick = (now: number) => {
      handle = 0;
      const dt = last ? (now - last) / 1000 : 0;
      if (!last || dt >= minGap) {
        last = now;
        latest.current(Math.min(dt, MAX_FRAME_S));
      }
      schedule();
    };
    const schedule = () => {
      if (handle || !onScreen || document.hidden) return;
      handle = requestAnimationFrame(tick);
    };
    const resume = () => { last = 0; schedule(); };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      resume();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', resume);
    schedule();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      if (handle) cancelAnimationFrame(handle);
    };
  }, [ref, fpsCap]);
}
