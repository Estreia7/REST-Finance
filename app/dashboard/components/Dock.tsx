'use client';

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from 'framer-motion';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * The desktop dock: the navigation as a row of round buttons floating at the
 * bottom of the screen, which swell under the pointer like a magnifier.
 *
 * A spring on each button's width, driven by how far the pointer is from its
 * centre, and a panel that grows to make room. The items are real buttons, so
 * keyboard and screen readers work; with reduced motion nothing swells and the
 * labels still show. clientX, not pageX: the dock is fixed, so its rects are
 * in viewport space.
 *
 * Two sizes, because this app has more destinations than fit a laptop at the
 * full size: up to seventeen buttons have to stay on screen at 1024px with one
 * of them magnified. Colours come from the .dock rules in globals.css.
 */

const SIZES = {
  full: { base: 54, magnify: 92, distance: 170, panel: 76, gap: 10 },
  compact: { base: 44, magnify: 72, distance: 140, panel: 64, gap: 6 },
} as const;

const SPRING: SpringOptions = { mass: 0.1, stiffness: 150, damping: 12 };

type Size = (typeof SIZES)[keyof typeof SIZES];

interface DockCtx {
  mouseX: MotionValue<number>;
  still: boolean;
  size: Size;
}

const Ctx = createContext<DockCtx | null>(null);
const ItemCtx = createContext<{ width: MotionValue<number>; hovered: MotionValue<number> } | null>(null);

function useDockSize(): Size {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide ? SIZES.full : SIZES.compact;
}

export function Dock({ theme, label, children }: { theme: 'light' | 'dark'; label: string; children: ReactNode }) {
  const mouseX = useMotionValue(Infinity);
  const hovered = useMotionValue(0);
  const still = Boolean(useReducedMotion());
  const size = useDockSize();
  const max = size.magnify + size.magnify / 2 + 4;
  const height = useSpring(useTransform(hovered, [0, 1], [size.panel, still ? size.panel : max]), SPRING);
  const value = useMemo(() => ({ mouseX, still, size }), [mouseX, still, size]);

  return (
    <motion.div
      className="dock-wrap"
      data-theme={theme}
      initial={{ y: 40, opacity: 0, filter: 'blur(6px)' }}
      animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      style={{ height }}
    >
      <nav
        className="dock"
        aria-label={label}
        style={{ height: size.panel, gap: size.gap }}
        onMouseMove={(e) => {
          hovered.set(1);
          mouseX.set(e.clientX);
        }}
        onMouseLeave={() => {
          hovered.set(0);
          mouseX.set(Infinity);
        }}
      >
        <Ctx.Provider value={value}>{children}</Ctx.Provider>
      </nav>
    </motion.div>
  );
}

export function DockItem({
  label, icon, current, pressed, badge, tour, onClick,
}: {
  label: string;
  icon: ReactNode;
  current?: boolean;
  /** For a toggle, not a destination. */
  pressed?: boolean;
  /** A count on the button. Zero hides it. */
  badge?: number;
  /** Anchors the walkthrough, as on the sidebar's buttons. */
  tour?: string;
  onClick: () => void;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('DockItem outside <Dock>');
  const { mouseX, still, size } = ctx;
  const ref = useRef<HTMLDivElement>(null);
  const hovered = useMotionValue(0);

  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - r.x - r.width / 2;
  });
  const target = useTransform<number, number>(
    distance,
    [-size.distance, 0, size.distance],
    [size.base, still ? size.base : size.magnify, size.base],
  );
  const width = useSpring(target, SPRING);

  return (
    <motion.div ref={ref} className="dock-item" data-current={current || undefined} style={{ width }}>
      <button
        type="button"
        aria-label={badge ? `${label} (${badge})` : label}
        aria-current={current ? 'page' : undefined}
        aria-pressed={pressed}
        data-tour={tour}
        onClick={onClick}
        onMouseEnter={() => hovered.set(1)}
        onMouseLeave={() => hovered.set(0)}
        onFocus={() => hovered.set(1)}
        onBlur={() => hovered.set(0)}
      >
        <ItemCtx.Provider value={{ width, hovered }}>
          <DockLabel>{label}</DockLabel>
          <DockIcon>{icon}</DockIcon>
        </ItemCtx.Provider>
      </button>
      {!!badge && <span className="dock-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
      {current && <span className="dock-dot" aria-hidden="true" />}
    </motion.div>
  );
}

function DockLabel({ children }: { children: ReactNode }) {
  const item = useContext(ItemCtx)!;
  const [visible, setVisible] = useState(false);
  useMotionValueEvent(item.hovered, 'change', (v) => setVisible(v === 1));
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          className="dock-label"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.18 }}
          style={{ x: '-50%' }}
          aria-hidden="true"
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children }: { children: ReactNode }) {
  const item = useContext(ItemCtx)!;
  const width = useTransform(item.width, (w) => w * 0.46);
  return (
    <motion.span className="dock-icon" style={{ width, height: width }}>
      {children}
    </motion.span>
  );
}

export function DockDivider() {
  return <span className="dock-divider" aria-hidden="true" />;
}
