import Image from 'next/image';
import logo from '@/public/brand/logo.png';

/**
 * The REST Finance logo.
 *
 * Uses the supplied artwork (public/brand/logo.png, 1254x1254, transparent)
 * through next/image so it is served in a modern format at the size actually
 * rendered, rather than shipping half a megabyte to every visitor.
 *
 * The artwork is a square lockup: the mark sits above the wordmark. In tight
 * horizontal space, use `Wordmark` instead, which pairs a cropped mark with
 * live text.
 */
export default function Logo({
  className = '',
  size = 40,
  priority = false,
}: {
  className?: string;
  /** Rendered edge length in pixels. The source is square. */
  size?: number;
  /** Set on the logo above the fold so it is not lazy-loaded. */
  priority?: boolean;
}) {
  return (
    <Image
      src={logo}
      alt="REST Finance"
      width={size}
      height={size}
      priority={priority}
      className={className}
      // The source is 1254px square; cap the fetched size to what we draw.
      sizes={`${size}px`}
    />
  );
}

/**
 * Horizontal lockup for the navbar and footer, where the square artwork would
 * either be tiny or eat the full bar height.
 *
 * The mark comes from the artwork; the name is live text, so it stays
 * selectable, searchable and legible to assistive technology, and it picks up
 * the current theme's foreground colour.
 */
export function Wordmark({
  className = '',
  markSize = 34,
  priority = false,
}: {
  className?: string;
  markSize?: number;
  priority?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="relative shrink-0 overflow-hidden"
        style={{ width: markSize, height: markSize }}
      >
        {/*
          The artwork is a square lockup with the wordmark in its lower third.
          Scaling up and clipping isolates the mark, so the name is not
          rendered twice at an unreadable size beside the live text.
        */}
        <Image
          src={logo}
          alt=""
          aria-hidden="true"
          width={markSize * 1.62}
          height={markSize * 1.62}
          priority={priority}
          className="absolute left-1/2 -translate-x-1/2 max-w-none"
          style={{ top: 0 }}
        />
      </span>
      <span className="font-display text-lg font-bold tracking-tight leading-none text-foreground">
        REST<span className="text-primary-ink"> Finance</span>
      </span>
    </span>
  );
}
