'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, X, ZoomIn } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { CLOSE_UP, FIT, panBy, zoomAt, type ZoomView } from '@/lib/zoom';

/**
 * A document that can be looked at closely.
 *
 * Tapping it opens the page over the whole screen, because a pinch inside a
 * scrolling dialog fights the scroll. Pinch and drag on a phone; wheel, drag and
 * double click with a mouse, and the buttons for anyone who wants neither.
 */

const BUTTON_STEP = 1.5;

function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useLanguage();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ZoomView>(FIT);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const lastTap = useRef(0);

  const size = () => {
    const box = boxRef.current?.getBoundingClientRect();
    return { left: box?.left ?? 0, top: box?.top ?? 0, width: box?.width ?? 1, height: box?.height ?? 1 };
  };

  const zoomCentre = (factor: number) => {
    const box = size();
    setView((v) => zoomAt(v, factor, box.width / 2, box.height / 2, box));
  };

  useEffect(() => {
    closeRef.current?.focus();
    // In the capture phase, so Escape leaves the page and not the dialog under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Bound by hand: React's wheel listener is passive and cannot stop the scroll.
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = element.getBoundingClientRect();
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.002), e.clientX - box.left, e.clientY - box.top, box));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;

    if (pointers.current.size === 1) {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        const box = size();
        const [px, py] = [e.clientX - box.left, e.clientY - box.top];
        setView((v) => (v.scale > 1 ? FIT : zoomAt(v, CLOSE_UP, px, py, box)));
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const before = pointers.current.get(e.pointerId);
    if (!before) return;
    const box = size();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      setView((v) => panBy(v, e.clientX - before.x, e.clientY - before.y, box));
      return;
    }
    const [a, b] = [...pointers.current.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const previous = pinch.current;
    pinch.current = distance;
    if (previous) {
      const [px, py] = [(a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top];
      setView((v) => zoomAt(v, distance / previous, px, py, box));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const control = 'w-11 h-11 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40';

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black" role="dialog" aria-modal="true" aria-label={alt}>
      <div
        ref={boxRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`absolute inset-0 overflow-hidden touch-none select-none ${view.scale > 1 ? 'cursor-grab' : 'cursor-zoom-in'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated file, not a static asset */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="w-full h-full object-contain origin-top-left will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>

      <div
        className="absolute right-4 flex flex-col gap-2"
        style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t('zoom.close')} className={control}>
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => zoomCentre(BUTTON_STEP)} aria-label={t('zoom.in')} className={control}>
          <Plus className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomCentre(1 / BUTTON_STEP)}
          disabled={view.scale <= 1}
          aria-label={t('zoom.out')}
          className={control}
        >
          <Minus className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('zoom.open')}
        className="group relative block w-full cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated file, not a static asset */}
        <img src={src} alt={alt} className={className} />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
          <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
          {t('zoom.hint')}
        </span>
      </button>
      {open && <Viewer src={src} alt={alt} onClose={close} />}
    </>
  );
}
