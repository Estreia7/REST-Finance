'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import {
  stepSpring,
  useElementSize,
  useVisibleLoop,
  valueNoise1D,
  type SpringConfig,
  type SpringState,
} from '@/components/ui/handoff-beam-utils';

export type BeamPhase = 'idle' | 'listening' | 'thinking' | 'speaking';
export type BeamLevel = number | (() => number | [number, number, number]);

export interface HandoffBeamProps {
  phase: BeamPhase;
  /** How loud the line is, 0 to 1: a number, or a function read on every frame. */
  level?: BeamLevel;
  children?: ReactNode;
  /** Corner radius of the host, so the light is clipped to it. */
  radius?: number;
  /** Height in px the light may rise into the host from its bottom edge. */
  reach?: number;
  intensity?: number;
  className?: string;
}

const PHASE_INDEX: Record<BeamPhase, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
};

// Every phase is a weight. All four glide on the same critically damped spring, so they always
// sum to 1 and any mix of two phases is a valid pose: changes morph, never swap.
const MORPH: SpringConfig = { stiffness: 64, damping: 16, mass: 1 };

// Per phase (idle, listening, thinking, speaking): span as a fraction of the host width,
// resting brightness, and the extra brightness the level adds.
const SPAN = [0.16, 0.6, 0.3, 0.5];
const BRIGHT = [0.42, 0.55, 0.85, 0.62];
const BRIGHT_GAIN = [0, 0.45, 0, 0.35];

const POINTS = 96; // curve samples across the span
const RAMP = 96; // colour ramp texels across the span
const SHIMMER_S = 1.5; // seconds for one pass of the thinking shimmer
const SHIMMER_W = 0.22; // shimmer half-width, in span units
const IDLE_BREATH_HZ = 0.2;
const LISTEN_FLOOR = 0.07; // a faint drift while listening to silence, so it never reads as off
const DPR_CAP = 2;
const STATIC_CLOCK = 0.8; // frozen time for reduced motion, picked for a balanced pose
const STATIC_RAW: [number, number, number] = [0.6, 0.45, 0.3];
const CENTER = 0.5; // horizontal centre of the light, 0 to 1
const HELD_LEVEL = 0.45; // how far the thinking shimmer lifts the line, 0 to 1
const ATTACK_MS = 70;
const RELEASE_MS = 260;
const THRESHOLD = 0.06;
const SENSITIVITY = 1.4;

const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep01(u: number): number {
  const c = clamp01(u);
  return c * c * (3 - 2 * c);
}

// Raised cosine in cycles: 0 to 1, crest at whole numbers.
function bump(p: number): number {
  return 0.5 + 0.5 * Math.cos(2 * Math.PI * p);
}

function hexToRgb(hex: string, out: Float32Array, at: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  out[at] = (n >> 16) & 255;
  out[at + 1] = (n >> 8) & 255;
  out[at + 2] = n & 255;
}

interface PaletteSpec {
  key: string;
  core: string[]; // per phase: idle, listening, thinking, speaking
  edge: string[];
  glow: number; // glow and haze strength
  gain: number; // line opacity gain: light surfaces need a firmer line
}

// The app's amber (--primary in globals.css). A canvas cannot read a CSS variable as a
// colour stop, so as with the charts the two themes are written out here.
const PALETTES: Record<'light' | 'dark', PaletteSpec> = {
  dark: {
    key: 'amber:dark',
    core: ['#f9a91f', '#fbb73f', '#fde3ad', '#fbbf52'],
    edge: ['#f9a91f', '#ea7a17', '#fbb73f', '#f2931c'],
    glow: 1,
    gain: 1,
  },
  // Deeper, because on a white card a pale glow washes out.
  light: {
    key: 'amber:light',
    core: ['#d98a04', '#e39205', '#ee9f0a', '#d98404'],
    edge: ['#d98a04', '#c2620a', '#d98404', '#e39205'],
    glow: 0.6,
    gain: 1.7,
  },
};

interface Engine {
  w: [SpringState, SpringState, SpringState, SpringState];
  env: Float32Array; // attack/release envelope per band
  lvl: Float32Array; // envelope smoothed once more, what the shape reads
  raw: [number, number, number];
  clock: number; // own clock, so a loop restart never jumps the motion
  shimmerT: number;
  lastPhase: BeamPhase | null;
  ys: Float32Array; // curve height above the baseline, px
  win: Float32Array; // taper per sample
  colors: Float32Array; // core rgb x4 then edge rgb x4
  colorKey: string;
  ramp: HTMLCanvasElement | null;
  rampData: ImageData | null;
}

interface Latest {
  phase: BeamPhase;
  level: BeamLevel | undefined;
  reduce: boolean;
  palette: PaletteSpec;
  intensity: number;
  cssW: number;
  cssH: number;
}

function createEngine(phase: BeamPhase): Engine {
  const k = PHASE_INDEX[phase];
  const spring = (i: number): SpringState => ({ x: i === k ? 1 : 0, v: 0 });
  const win = new Float32Array(POINTS + 1);
  for (let i = 0; i <= POINTS; i++) {
    const u = (i / POINTS) * 2 - 1;
    const q = 1 - u * u;
    win[i] = q * q;
  }
  return {
    w: [spring(0), spring(1), spring(2), spring(3)],
    env: new Float32Array(3),
    lvl: new Float32Array(3),
    raw: [0, 0, 0],
    clock: 0,
    shimmerT: 0,
    lastPhase: null,
    ys: new Float32Array(POINTS + 1),
    win,
    colors: new Float32Array(24),
    colorKey: '',
    ramp: null,
    rampData: null,
  };
}

// Fills engine.raw from a level source. Array getters are read without copying.
function readLevel(e: Engine, level: BeamLevel | undefined) {
  const s = level === undefined ? 0 : typeof level === 'function' ? level() : level;
  if (Array.isArray(s)) {
    e.raw[0] = s[0] ?? 0;
    e.raw[1] = s[1] ?? 0;
    e.raw[2] = s[2] ?? 0;
  } else {
    e.raw[0] = s;
    e.raw[1] = s * 0.8;
    e.raw[2] = s * 0.6;
  }
}

// Parses the palette once per palette change, and makes the ramp canvas once.
function ensureColors(e: Engine, spec: PaletteSpec) {
  if (e.colorKey === spec.key) return;
  for (let k = 0; k < 4; k++) {
    hexToRgb(spec.core[k], e.colors, k * 3);
    hexToRgb(spec.edge[k], e.colors, 12 + k * 3);
  }
  e.colorKey = spec.key;
  if (!e.ramp) {
    e.ramp = document.createElement('canvas');
    e.ramp.width = RAMP;
    e.ramp.height = 1;
    const rctx = e.ramp.getContext('2d');
    e.rampData = rctx ? rctx.createImageData(RAMP, 1) : null;
  }
}

// Half-thickness factor: a plain taper (shimmerAt NaN), or a gaussian lens around the shimmer.
function thickness(e: Engine, i: number, shimmerAt: number): number {
  if (Number.isNaN(shimmerAt)) return 0.25 + 0.75 * Math.sqrt(e.win[i]);
  const u = (i / POINTS) * 2 - 1;
  const d = (u - shimmerAt) / SHIMMER_W;
  return Math.exp(-d * d) * e.win[i];
}

// Traces a ribbon around the curve: top edge left to right, bottom edge back. The thickness
// follows the taper, so the ends close to a point and need no caps.
function ribbon(
  ctx: CanvasRenderingContext2D,
  e: Engine,
  x0: number,
  dx: number,
  base: number,
  half: number,
  shimmerAt: number,
) {
  ctx.beginPath();
  for (let i = 0; i <= POINTS; i++) {
    const y = base - e.ys[i] - half * thickness(e, i, shimmerAt);
    if (i === 0) ctx.moveTo(x0, y);
    else ctx.lineTo(x0 + i * dx, y);
  }
  for (let i = POINTS; i >= 0; i--) {
    ctx.lineTo(x0 + i * dx, base - e.ys[i] + half * thickness(e, i, shimmerAt));
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Wraps a host (a composer, an input, a card) and lights a hairline along its bottom edge.
 * It listens (soft crests draw in towards the centre), thinks (a shimmer travels the line) and
 * speaks (calm ripples flow outwards). Every parameter is a mix of the four phases on one
 * critically damped spring, so it morphs between them and never swaps. Canvas 2D only.
 *
 * Purely decorative: whatever the phase means must also be said by the host.
 */
export function HandoffBeam({
  phase,
  level,
  children,
  radius = 32,
  reach = 22,
  intensity = 1,
  className,
}: HandoffBeamProps) {
  const { resolvedTheme } = useTheme();
  const reducedPref = useReducedMotion();
  // Server and first client render both read "not reduced", so hydration matches.
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const reduce = mounted && reducedPref === true;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(rootRef);
  const engineRef = useRef<Engine | null>(null);

  const reachEff = size.height > 0 ? Math.min(reach, size.height) : reach;
  const palette = PALETTES[resolvedTheme];

  // Everything the loop reads. Written in an effect so the render stays pure.
  const latest = useRef<Latest | null>(null);
  useEffect(() => {
    latest.current = { phase, level, reduce, palette, intensity, cssW: size.width, cssH: reachEff };
  });

  const frame = (dtIn: number) => {
    const L = latest.current;
    const canvas = canvasRef.current;
    if (!L || !canvas) return;
    if (!engineRef.current) engineRef.current = createEngine(L.phase);
    const e = engineRef.current;
    const dt = L.reduce ? 0 : dtIn;
    e.clock += dt;
    const t = L.reduce ? STATIC_CLOCK : e.clock;

    const { cssW, cssH } = L;
    if (cssW <= 0 || cssH <= 0) return;

    // Each thought starts at the left: the shimmer restarts off-span when thinking begins.
    if (L.phase === 'thinking' && e.lastPhase !== 'thinking') e.shimmerT = 0;
    e.lastPhase = L.phase;

    // Phase weights.
    const target = PHASE_INDEX[L.phase];
    for (let k = 0; k < 4; k++) {
      const s = e.w[k];
      if (L.reduce) {
        s.x = k === target ? 1 : 0;
        s.v = 0;
      } else {
        stepSpring(s, k === target ? 1 : 0, MORPH, dt);
      }
    }
    const wI = clamp01(e.w[0].x);
    const wL = clamp01(e.w[1].x);
    const wT = clamp01(e.w[2].x);
    const wS = clamp01(e.w[3].x);

    // Levels: raw input, an attack/release envelope, then one more smoothing pass so the
    // line glides rather than jitters. Speaking smooths more, which is what makes it calm.
    if (L.reduce) {
      e.raw[0] = STATIC_RAW[0];
      e.raw[1] = STATIC_RAW[1];
      e.raw[2] = STATIC_RAW[2];
    } else {
      readLevel(e, L.level);
    }
    const smoothTau = 0.07 + 0.2 * wS;
    for (let b = 0; b < 3; b++) {
      const r = e.raw[b] < THRESHOLD ? 0 : clamp01(e.raw[b] * SENSITIVITY);
      if (L.reduce) {
        e.env[b] = r;
        e.lvl[b] = r;
      } else {
        const tau = (r > e.env[b] ? ATTACK_MS : RELEASE_MS) / 1000;
        e.env[b] += (r - e.env[b]) * (1 - Math.exp(-dtIn / tau));
        e.lvl[b] += (e.env[b] - e.lvl[b]) * (1 - Math.exp(-dtIn / smoothTau));
      }
    }
    const low = e.lvl[0];
    const mid = e.lvl[1];
    const high = e.lvl[2];
    const energy = clamp01(low * 0.5 + mid * 0.3 + high * 0.2);

    if (!L.reduce) e.shimmerT += dt * (0.35 + 0.65 * wT);
    // The shimmer enters off-span on the left and leaves off-span on the right, so the wrap is unseen.
    const shimmerAt = L.reduce ? 0 : -1.4 + 2.8 * ((e.shimmerT / SHIMMER_S) % 1);
    const breath = L.reduce ? 0 : Math.sin(2 * Math.PI * IDLE_BREATH_HZ * t);

    // The mixed pose.
    const span = wI * SPAN[0] + wL * SPAN[1] + wT * SPAN[2] + wS * SPAN[3];
    const bright =
      wI * (BRIGHT[0] + 0.1 * breath) +
      wL * (BRIGHT[1] + BRIGHT_GAIN[1] * energy) +
      wT * BRIGHT[2] +
      wS * (BRIGHT[3] + BRIGHT_GAIN[3] * energy);
    const amp = cssH * 0.7;
    const speakAmp = 0.28 + 0.72 * energy;

    // Curve heights. Listening crests travel inwards, speaking crests travel outwards.
    for (let i = 0; i <= POINTS; i++) {
      const u = (i / POINTS) * 2 - 1;
      // A softened |u|, so the centre is a smooth crest, never a kink.
      const d = Math.sqrt(u * u + 0.004);
      const listen =
        LISTEN_FLOOR * bump(1.1 * d + 0.55 * t) +
        low * 0.75 * bump(1.1 * d + 0.55 * t) +
        mid * 0.4 * bump(2.3 * d + 0.95 * t + 0.18 * u) +
        high * 0.24 * bump(3.8 * d + 1.5 * t - 0.3 * u);
      const speak = speakAmp * (0.22 + 0.5 * bump(1.25 * d - 0.62 * t) + 0.12 * bump(2.6 * d - 1.24 * t));
      const sd = (u - shimmerAt) / (SHIMMER_W * 1.6);
      const think = HELD_LEVEL * (0.12 + 0.4 * Math.exp(-sd * sd));
      e.ys[i] = amp * e.win[i] * (wL * listen + wS * speak + wT * think);
    }

    // Colour ramp across the span: core in the middle, edge colour at the ends, the alpha taper,
    // and a lift where the shimmer is. Written into a preallocated ImageData.
    ensureColors(e, L.palette);
    const ramp = e.ramp;
    const data = e.rampData;
    if (!ramp || !data) return;
    const C = e.colors;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    let er = 0;
    let eg = 0;
    let eb = 0;
    for (let k = 0; k < 4; k++) {
      const wk = clamp01(e.w[k].x);
      cr += wk * C[k * 3];
      cg += wk * C[k * 3 + 1];
      cb += wk * C[k * 3 + 2];
      er += wk * C[12 + k * 3];
      eg += wk * C[12 + k * 3 + 1];
      eb += wk * C[12 + k * 3 + 2];
    }
    const px = data.data;
    for (let j = 0; j < RAMP; j++) {
      const u = ((j + 0.5) / RAMP) * 2 - 1;
      const d = u < 0 ? -u : u;
      const m = smoothstep01((d - 0.15) / 0.75);
      const sd = (u - shimmerAt) / SHIMMER_W;
      const lift = wT * Math.exp(-sd * sd);
      const q = 1 - d * d;
      const a = clamp01(bright * L.palette.gain * L.intensity * q * Math.sqrt(q) * (1 + 0.55 * lift));
      const o = j * 4;
      px[o] = cr + (er - cr) * m;
      px[o + 1] = cg + (eg - cg) * m;
      px[o + 2] = cb + (eb - cb) * m;
      px[o + 3] = a * 255;
    }
    const rctx = ramp.getContext('2d');
    if (!rctx) return;
    rctx.putImageData(data, 0, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(bw / cssW, 0, 0, bh / cssH, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cssW, cssH);

    const spanPx = Math.max(8, span * cssW);
    const x0 = Math.min(cssW - spanPx, Math.max(0, CENTER * cssW - spanPx / 2));
    const dx = spanPx / POINTS;
    const base = cssH - 1; // the line sits on the host's bottom border
    const glow = L.palette.glow;

    // Mask in white: a faint haze under the curve, two soft glow ribbons and a hairline core.
    ctx.fillStyle = '#fff';
    for (let layer = 1; layer <= 3; layer++) {
      const f = layer / 3;
      ctx.globalAlpha = 0.045 * glow;
      ctx.beginPath();
      ctx.moveTo(x0, base);
      for (let i = 0; i <= POINTS; i++) ctx.lineTo(x0 + i * dx, base - e.ys[i] * f);
      ctx.lineTo(x0 + spanPx, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.07 * glow;
    ribbon(ctx, e, x0, dx, base, 5.5, Number.NaN);
    ctx.globalAlpha = 0.26 * glow;
    ribbon(ctx, e, x0, dx, base, 2.2, Number.NaN);
    ctx.globalAlpha = 1;
    ribbon(ctx, e, x0, dx, base, 0.85, Number.NaN);
    if (wT > 0.01) {
      ctx.globalAlpha = 0.5 * wT;
      ribbon(ctx, e, x0, dx, base, 1.6, shimmerAt);
    }

    // Tint: keep the mask's alpha, take colour and taper from the ramp.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-in';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ramp, x0, 0, spanPx, cssH);
    ctx.globalCompositeOperation = 'source-over';
  };

  useVisibleLoop(rootRef, frame, { fpsCap: reduce ? 10 : 0 });

  return (
    <div
      ref={rootRef}
      data-phase={phase}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ borderRadius: radius }}
    >
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 block"
        style={{ width: '100%', height: reachEff }}
      />
    </div>
  );
}

/**
 * A syllable-like level source. Returns the same [low, mid, high] array every call.
 * The phrase carrier is a seeded value noise, so each seed has its own rhythm.
 */
export function createSimulatedVoice(seed: number): () => [number, number, number] {
  const phrase = valueNoise1D(seed);
  const pitch = valueNoise1D(seed + 53);
  const out: [number, number, number] = [0, 0, 0];
  let t0 = -1;
  return () => {
    const now = performance.now();
    if (t0 < 0) t0 = now;
    const x = (now - t0) / 1000;
    const carrier = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.1 * x + 1.7 * pitch(x * 0.6));
    const speaking = clamp01(phrase(x * 0.7) * 2);
    const env = clamp01(carrier * carrier * speaking);
    out[0] = clamp01(env * (0.9 + 0.1 * pitch(x * 1.9)));
    out[1] = clamp01(env * (0.7 + 0.2 * pitch(x * 2.6)));
    out[2] = clamp01(env * (0.45 + 0.2 * pitch(x * 3.4)));
    return out;
  };
}

export default HandoffBeam;
