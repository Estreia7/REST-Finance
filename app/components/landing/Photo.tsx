import Image from 'next/image';

/**
 * A photograph on the landing page.
 *
 * The set is documentary and deliberately dark, while the page is light-first,
 * so every photo is framed as a distinct panel — hairline border, rounded
 * corners, fixed aspect ratio — rather than bled into the canvas. That keeps
 * the warm off-white background reading as the page and the photo reading as
 * an image, which is what stops the composition collapsing into murk.
 *
 * `priority` is for the hero only: everything else is below the fold and
 * should not compete with it for bandwidth.
 */
export default function Photo({
  src,
  alt,
  ratio = 'aspect-[3/2]',
  className = '',
  sizes = '(min-width: 1024px) 50vw, 100vw',
  priority = false,
}: {
  src: string;
  /** Describe what the image shows. Empty string only if truly decorative. */
  alt: string;
  /** Tailwind aspect-ratio class. The source files are 3:2, hero is 16:9. */
  ratio?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative ${ratio} overflow-hidden rounded-2xl border border-border bg-accent ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
