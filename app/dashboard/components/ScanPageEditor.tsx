'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, Loader2, RotateCw, X } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import {
  SCAN_FILTERS,
  finishPage,
  filterCanvas,
  limitSize,
  nextRotation,
  rotateCanvas,
  toDataUrl,
  type Rotation,
  type ScanFilter,
} from '@/lib/scan-image';

/**
 * What the owner does with a photograph once it has been taken: straighten the
 * crop, turn it the right way up, pick the filter that makes the print legible,
 * and say it is good.
 *
 * Two rules shape the whole component.
 *
 * The first is that the full-resolution page is never filtered for a preview.
 * A supplier invoice off a modern phone is well over ten megapixels, and
 * re-running `blackwhite` over all of it on every tap would lock the main
 * thread for most of a second each time — on the phone of someone standing in a
 * kitchen at midnight. So the preview runs on a downscaled copy, and the real
 * filter is applied exactly once, when the page is confirmed.
 *
 * The second is that scanic is loaded on demand. It is WebAssembly, and the
 * dashboard should not carry it in its initial bundle for the owners who never
 * open the camera.
 */

interface Corners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

/** A finished page: the upload image, and a small copy for the page strip. */
export interface ScannedPage {
  dataUrl: string;
  thumbnail: string;
}

export interface ScanPageEditorProps {
  /** The captured frame, at full resolution. */
  frame: HTMLCanvasElement;
  /** Corners the camera found, in frame coordinates. Null when it found none. */
  detectedCorners: Corners | null;
  onDone: (page: ScannedPage) => void;
  onCancel: () => void;
}

/** Longest edge of the live preview. Big enough to judge a filter by, small
 *  enough to re-filter in a few milliseconds. */
const PREVIEW_EDGE = 900;

/** Longest edge of a page-strip thumbnail. */
const THUMBNAIL_EDGE = 200;

/**
 * Where the default quad sits when detection found nothing.
 *
 * Inset rather than flush with the edges: a quad on the frame border gives the
 * owner nothing to grab, and a photograph almost always has some table or floor
 * around the page anyway.
 */
const DEFAULT_INSET = 0.08;

function defaultCorners(width: number, height: number): Corners {
  const x = width * DEFAULT_INSET;
  const y = height * DEFAULT_INSET;
  return {
    topLeft: { x, y },
    topRight: { x: width - x, y },
    bottomRight: { x: width - x, y: height - y },
    bottomLeft: { x, y: height - y },
  };
}

/** Reads a themed colour off the document so scanic's canvas layer matches the
 *  rest of the app in both light and dark, without hardcoding a hex. */
function themeColor(variable: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return raw ? `hsl(${raw})` : fallback;
}

export default function ScanPageEditor({
  frame,
  detectedCorners,
  onDone,
  onCancel,
}: ScanPageEditorProps) {
  const { t } = useLanguage();

  /** The perspective-corrected page, or the raw frame until the crop is
   *  applied. This is the full-resolution source `finishPage` works from. */
  const [page, setPage] = useState<HTMLCanvasElement>(frame);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [filter, setFilter] = useState<ScanFilter>('enhanced');
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cropHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLImageElement>(null);
  /** The downscaled, unfiltered copy every preview is drawn from. */
  const previewSourceRef = useRef<HTMLCanvasElement | null>(null);
  /** The object URL currently in the preview, so it can be revoked. */
  const previewUrlRef = useRef<string | null>(null);
  /** Guards against a preview that finished after a newer one started. */
  const previewSeqRef = useRef(0);

  /** Rebuild the downscaled preview source whenever the page or its rotation
   *  changes. Rotating 900px is cheap; rotating the original is not. */
  useEffect(() => {
    const small = limitSize(page, PREVIEW_EDGE);
    previewSourceRef.current = rotateCanvas(small, rotation);
  }, [page, rotation]);

  /** Paint the preview: filter the small copy, encode it, swap it in, and let
   *  go of the URL the previous one was holding. */
  useEffect(() => {
    const source = previewSourceRef.current;
    const image = previewRef.current;
    if (!source || !image) return;

    // `toBlob` is asynchronous, so a fast series of filter taps can land its
    // callbacks out of order. The sequence number means only the newest one
    // ever creates a URL — nothing is created and then thrown away, so there
    // is nothing for the cleanup to chase.
    const seq = ++previewSeqRef.current;

    const filtered = filterCanvas(source, filter);
    filtered.toBlob(
      (blob) => {
        if (seq !== previewSeqRef.current || !blob || !previewRef.current) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        previewRef.current.src = url;
      },
      'image/jpeg',
      0.85,
    );

    // Bumping the sequence is enough to retire this pass; the unmount effect
    // below releases whichever URL was last installed.
    return () => {
      previewSeqRef.current++;
    };
  }, [page, rotation, filter]);

  // The last preview URL outlives every effect above it, so it is released when
  // the editor itself goes away.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    },
    [],
  );

  /**
   * Straightens the page before the owner ever sees it.
   *
   * The corners were already found while they were pointing the camera, so
   * presenting the raw photograph — table, keyboard and all — asks them to
   * confirm a crop the app had worked out for itself. The page arrives cut
   * out and squared up; "Ajustar recorte" is there for when it got it wrong.
   *
   * Runs once, on mount. Nothing here depends on state that changes: a later
   * crop goes through the corner editor, which starts from `frame` again.
   */
  useEffect(() => {
    if (!detectedCorners) return;

    let cancelled = false;
    setBusy(true);

    void (async () => {
      try {
        const { extractDocument } = await import('scanic');
        const result = await extractDocument(frame, detectedCorners, { output: 'canvas' });
        if (cancelled) return;
        // A failure here is not worth a message. The owner has a usable
        // photograph and a crop button; telling them the automatic step they
        // never asked for did not happen would only be noise.
        if (result.output instanceof HTMLCanvasElement) setPage(result.output);
      } catch {
        // Same reasoning: fall back to the frame as photographed.
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Mounts scanic's corner editor over the original frame.
   *
   * Corners are always taken against `frame`, never against an already-cropped
   * page: re-cropping a crop compounds the perspective correction and the owner
   * ends up with a page they cannot straighten back out. Re-opening the crop
   * therefore starts again from the photograph.
   */
  useEffect(() => {
    if (!cropping) return;
    const host = cropHostRef.current;
    if (!host) return;

    let cancelled = false;
    let editor: { destroy(): void } | null = null;

    const mount = async () => {
      try {
        const { createCornerEditor, extractDocument } = await import('scanic');
        if (cancelled || !cropHostRef.current) return;

        const apply = async (corners: Corners) => {
          setCropping(false);
          setBusy(true);
          try {
            const result = await extractDocument(frame, corners, { output: 'canvas' });
            const output = result.output;
            if (output instanceof HTMLCanvasElement) {
              setPage(output);
              setRotation(0);
            } else {
              setError(t('scanEditor.cropFailed'));
            }
          } catch {
            setError(t('scanEditor.cropFailed'));
          } finally {
            setBusy(false);
          }
        };

        editor = createCornerEditor({
          container: cropHostRef.current,
          image: frame,
          corners: detectedCorners ?? defaultCorners(frame.width, frame.height),
          magnifier: { enabled: true, size: 120, zoom: 2.5 },
          nudges: { enabled: true, steps: [1, 10] },
          toolbar: {
            enabled: true,
            reset: true,
            cancel: true,
            apply: true,
            labels: {
              reset: t('scanEditor.reset'),
              cancel: t('common.cancel'),
              apply: t('scanEditor.applyCrop'),
            },
          },
          theme: {
            accent: themeColor('--primary', '#f59e0b'),
            surface: themeColor('--card', '#ffffff'),
            surfaceColor: themeColor('--foreground', '#111111'),
            mask: 'rgba(0, 0, 0, 0.55)',
            radius: '0.75rem',
          },
          // 44px is the smallest target a thumb reliably hits, and this is
          // used one-handed.
          handleHitArea: 44,
          keyboard: true,
          onConfirm: (corners) => {
            void apply(corners);
          },
          onCancel: () => setCropping(false),
        });
      } catch {
        if (!cancelled) {
          setCropping(false);
          setError(t('scanEditor.cropUnavailable'));
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      editor?.destroy();
    };
  }, [cropping, frame, detectedCorners, t]);

  const handleRotate = useCallback(() => {
    setRotation((current) => nextRotation(current));
  }, []);

  /** The one place the full-resolution filter runs. */
  const handleConfirm = useCallback(() => {
    setBusy(true);
    setError(null);

    // Yielded to the browser so the spinner actually paints before the main
    // thread disappears into a multi-megapixel filter pass.
    requestAnimationFrame(() => {
      try {
        const dataUrl = finishPage(page, rotation, filter);
        const small = limitSize(rotateCanvas(page, rotation), THUMBNAIL_EDGE);
        const thumbnail = toDataUrl(filterCanvas(small, filter), 0.7);
        onDone({ dataUrl, thumbnail });
      } catch {
        setError(t('scanEditor.saveFailed'));
        setBusy(false);
      }
    });
  }, [page, rotation, filter, onDone, t]);

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={t('scanEditor.title')}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('scanEditor.discardPage')}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground
                     hover:bg-muted hover:text-foreground focus-visible:outline-none
                     focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="truncate text-sm font-semibold text-foreground">{t('scanEditor.title')}</h2>
        <span className="w-11" aria-hidden="true" />
      </header>

      {/* The page itself. min-h-0 so the preview shrinks rather than pushing
          the controls off the bottom of a short phone screen. */}
      <div className="relative min-h-0 flex-1 bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={previewRef}
          alt={t('scanEditor.previewAlt')}
          className="absolute inset-0 h-full w-full object-contain p-3"
        />

        {busy && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70"
            role="status"
          >
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm text-foreground">{t('scanEditor.working')}</span>
          </div>
        )}

        {cropping && <div ref={cropHostRef} className="absolute inset-0 z-10" />}
      </div>

      {error && (
        <p className="shrink-0 px-4 py-2 text-center text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <div
        className="card-glass shrink-0 rounded-b-none border-x-0 border-b-0 px-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <fieldset className="mb-3">
          <legend className="section-label mb-2">{t('scanEditor.filter')}</legend>
          {/* Scrolls rather than wraps: four labels at 380px would otherwise
              become two cramped rows. */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {SCAN_FILTERS.map((option) => {
              const active = option === filter;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option)}
                  className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-3
                              text-xs font-semibold transition-colors focus-visible:outline-none
                              focus-visible:ring-2 focus-visible:ring-ring ${
                                active
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                              }`}
                >
                  {/* A tick as well as the colour, so the active filter is not
                      told by hue alone. */}
                  <Check
                    className={`h-3.5 w-3.5 ${active ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden="true"
                  />
                  {t(`scanEditor.filters.${option}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCropping(true)}
            disabled={busy || cropping}
            className="cta-button-secondary min-h-[44px] flex-1 !px-3 !py-2 disabled:opacity-50"
          >
            <Crop className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{t('scanEditor.adjustCrop')}</span>
          </button>

          <button
            type="button"
            onClick={handleRotate}
            disabled={busy || cropping}
            aria-label={t('scanEditor.rotate')}
            className="cta-button-secondary min-h-[44px] !w-11 !px-0 !py-2 disabled:opacity-50"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || cropping}
            className="cta-button min-h-[44px] flex-1 !px-3 !py-2 disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{t('scanEditor.usePage')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
