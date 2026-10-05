'use client';

import { useEffect, useState } from 'react';

/**
 * The restaurant's own mark, wherever the app shows whose restaurant it is.
 *
 * Contained, never cropped: logos come in every shape — a wide wordmark, a
 * round seal, a tall crest — and `object-cover` would cut the name off half
 * of them. They sit on a white tile with a little padding because almost
 * every logo is drawn for a light background, including in dark mode.
 *
 * With no logo, or one that fails to load, the restaurant's initials stand in
 * on the brand tint, so the spot is never an empty grey box.
 */

/** Words too small to carry an initial: "Tasca do Bairro" is TB, not TDB. */
const MINOR_WORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'the', 'and', 'of', '&']);

export function restaurantInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !MINOR_WORDS.has(w.toLowerCase()));
  const pick = (meaningful.length ? meaningful : words).slice(0, 2);
  return pick.map((w) => w.charAt(0).toUpperCase()).join('') || '·';
}

export default function RestaurantLogo({
  logoPath,
  name,
  size = 40,
  decorative = true,
  className = '',
}: {
  logoPath: string | null | undefined;
  name: string | null | undefined;
  /** Width and height, in px. */
  size?: number;
  /**
   * True when the name is written beside it, so a screen reader is not told
   * twice. False where the logo stands alone and has to say whose it is.
   */
  decorative?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A new logo gets a fresh chance to load.
  useEffect(() => { setFailed(false); }, [logoPath]);

  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] ${className}`;
  const label = decorative ? undefined : name ?? undefined;

  if (logoPath && !failed) {
    return (
      <span
        className={`${box} bg-white ring-1 ring-border`}
        style={{ width: size, height: size }}
        role={decorative ? undefined : 'img'}
        aria-label={label}
        aria-hidden={decorative || undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served by an authenticated route, not something next/image can optimise */}
        <img
          src={`/api/images/${logoPath}`}
          alt=""
          className="w-full h-full object-contain"
          style={{ padding: Math.max(2, Math.round(size * 0.08)) }}
          onError={() => setFailed(true)}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      className={`${box} bg-primary-subtle text-primary-ink font-bold tracking-tight select-none`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      role={decorative ? undefined : 'img'}
      aria-label={label}
      aria-hidden={decorative || undefined}
    >
      {restaurantInitials(name)}
    </span>
  );
}
