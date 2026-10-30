import type { ReactNode } from 'react';

/**
 * The column every dashboard tab sits in.
 *
 * Content used to run edge to edge, so on a wide screen a form sat in the left
 * corner and a table's numbers ended a metre from its labels. Each tab now has
 * a measured, centred column: wide for tables and charts, narrower for forms,
 * where a long line is harder to fill in than to read.
 */
export type PageWidth = 'wide' | 'medium' | 'narrow';

const WIDTHS: Record<PageWidth, string> = {
  wide: 'max-w-[1200px]',
  medium: 'max-w-3xl',
  narrow: 'max-w-2xl',
};

export default function PageShell({ width = 'wide', children }: { width?: PageWidth; children: ReactNode }) {
  return <div className={`mx-auto w-full ${WIDTHS[width]} space-y-6`}>{children}</div>;
}
