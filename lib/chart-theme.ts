'use client';

import { useEffect, useState } from 'react';

/**
 * Chart colours, resolved from the CSS design tokens.
 *
 * Recharts needs concrete colour strings: it cannot take `hsl(var(--primary))`,
 * because the SVG attributes it generates are not subject to CSS variable
 * inheritance in every case, and several of its props expect plain values.
 *
 * So the tokens are read from the document once per theme and handed over as
 * real colours. That keeps one source of truth in globals.css instead of the
 * hardcoded palette the charts previously carried, which still showed the old
 * violet brand and used white-alpha gridlines that were invisible on the light
 * canvas.
 */

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Tokens are stored as bare HSL triplets ("38 95% 50%").
  return raw ? `hsl(${raw})` : fallback;
}

function readTokenAlpha(name: string, alpha: number, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw} / ${alpha})` : fallback;
}

export type ChartTheme = {
  /** Series colours, in the order charts should use them. */
  series: string[];
  primary: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  /** Axis labels and legend text. */
  axis: string;
  /** Gridlines: faint, but never invisible. */
  grid: string;
  /** Tooltip surface, matching the card it floats above. */
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

function buildTheme(): ChartTheme {
  const primary = readToken('--primary', 'hsl(38 95% 50%)');
  const success = readToken('--success', 'hsl(152 60% 28%)');
  const danger = readToken('--danger', 'hsl(0 70% 45%)');
  const warning = readToken('--warning', 'hsl(25 85% 30%)');
  const info = readToken('--info', 'hsl(215 70% 45%)');

  return {
    // Amber first, then hues far enough apart to stay distinguishable, and
    // not relying on red/green alone to carry meaning.
    series: [primary, info, success, warning, danger],
    primary,
    success,
    danger,
    warning,
    info,
    axis: readToken('--muted-foreground', 'hsl(220 10% 46%)'),
    // Derived from the border token, so it follows the theme instead of
    // being a white overlay that disappears on a light background.
    grid: readTokenAlpha('--border', 0.9, 'hsl(40 15% 88%)'),
    tooltipBg: readToken('--card-elevated', 'hsl(0 0% 100%)'),
    tooltipBorder: readToken('--border', 'hsl(40 15% 88%)'),
    tooltipText: readToken('--card-foreground', 'hsl(220 25% 12%)'),
  };
}

/**
 * Chart colours for the active theme, recomputed when it changes.
 *
 * The theme provider toggles `.dark` on the root element, so a MutationObserver
 * on its class list is what tells us the tokens now resolve differently.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => buildTheme());

  useEffect(() => {
    setTheme(buildTheme());

    const observer = new MutationObserver(() => setTheme(buildTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

/** Shared Recharts tooltip styling, so every chart reads the same. */
export function tooltipProps(theme: ChartTheme) {
  return {
    contentStyle: {
      background: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: '10px',
      fontSize: '12px',
      color: theme.tooltipText,
      boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
    },
    labelStyle: { color: theme.tooltipText, fontWeight: 600 },
    itemStyle: { color: theme.tooltipText },
  };
}
