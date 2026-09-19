'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, Loader2, ImageUp } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/**
 * The live camera, with the document outlined as you point at it.
 *
 * Detection runs on a small copy of the frame rather than the full sensor
 * image: finding a sheet of paper needs shape, not detail, and a phone at the
 * end of service should not be asked to process four thousand pixels a side
 * several times a second.
 *
 * The scanner library is loaded on demand. It is WebAssembly, and a restaurant
 * on a weak connection should not pay for it on every dashboard visit — only
 * when the camera is actually opened.
 */

interface Corners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

interface DocumentCameraProps {
  /** Receives the captured frame at full resolution, plus the detected corners
   *  in that frame's coordinates (null when nothing was found). */
  onCapture: (frame: HTMLCanvasElement, corners: Corners | null) => void;
  onClose: () => void;
  /** Offers "use a photo instead" when the camera cannot be opened. */
  onPickFile: () => void;
}

/** Width the detector sees. Enough for a page outline, cheap to process. */
const DETECT_WIDTH = 480;
/**
 * Detection settings.
 *
 * The ML detector is used because it is measurably better where it counts:
 * on a cluttered kitchen surface, with a shadow across the page and a faded
 * till roll, the classical pipeline loses the page and this does not. It is
 * also faster once loaded.
 *
 * The model is served from our own origin rather than the library default,
 * which is a public CDN: photographing an invoice should not depend on a
 * third party being reachable.
 */
const DETECTOR_OPTIONS = {
  detector: 'ml' as const,
  ml: {
    assetBaseUrl: '/scanner/',
    modelUrl: '/scanner/doccornernet_lean.ort',
    wasmPaths: '/scanner/',
  },
};

/** Roughly six checks a second: responsive without pinning the CPU. */
const DETECT_INTERVAL_MS = 160;

export default function DocumentCamera({ onCapture, onClose, onPickFile }: DocumentCameraProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const busyRef = useRef(false);
  const lastRef = useRef(0);
  /** Latest corners, in detector coordinates. Held in a ref so the detection
   *  loop does not re-render the component several times a second. */
  const cornersRef = useRef<Corners | null>(null);

  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [found, setFound] = useState(false);

  /** Draws the outline over the preview. */
  const paintOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video || !video.videoWidth) return;

    if (overlay.width !== video.clientWidth || overlay.height !== video.clientHeight) {
      overlay.width = video.clientWidth;
      overlay.height = video.clientHeight;
    }

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const corners = cornersRef.current;
    if (!corners) return;

    // The preview is object-cover, so the video is cropped to fill the box.
    // Map detector coordinates through the same crop or the outline drifts.
    const scale = Math.max(overlay.width / video.videoWidth, overlay.height / video.videoHeight);
    const drawnW = video.videoWidth * scale;
    const drawnH = video.videoHeight * scale;
    const offsetX = (overlay.width - drawnW) / 2;
    const offsetY = (overlay.height - drawnH) / 2;
    const detectScale = video.videoWidth / DETECT_WIDTH;

    const pt = (p: { x: number; y: number }) => ({
      x: p.x * detectScale * scale + offsetX,
      y: p.y * detectScale * scale + offsetY,
    });

    const quad = [pt(corners.topLeft), pt(corners.topRight), pt(corners.bottomRight), pt(corners.bottomLeft)];

    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    quad.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgb(245, 158, 11)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = 'rgb(245, 158, 11)';
    for (const p of quad) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  // Camera, detection loop and cleanup. One effect, because the stream must be
  // stopped by the same code that started it — a camera left running is a light
  // on the phone and a battery drain the owner will notice.
  useEffect(() => {
    let cancelled = false;
    let scanDocument: ((img: HTMLCanvasElement, opts?: unknown) => Promise<{ corners: Corners | null }>) | null = null;
    /** Drops to the classical detector if the model cannot be loaded, so a
     *  missing or unreachable file degrades the accuracy rather than the
     *  camera. */
    let useMl = true;

    const detect = async () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || busyRef.current || !scanDocument) return;

      const now = performance.now();
      if (now - lastRef.current < DETECT_INTERVAL_MS) return;
      lastRef.current = now;
      busyRef.current = true;

      try {
        if (!detectRef.current) detectRef.current = document.createElement('canvas');
        const small = detectRef.current;
        const ratio = video.videoHeight / video.videoWidth;
        small.width = DETECT_WIDTH;
        small.height = Math.round(DETECT_WIDTH * ratio);

        const sctx = small.getContext('2d', { willReadFrequently: true });
        if (sctx) {
          sctx.drawImage(video, 0, 0, small.width, small.height);
          const result = await scanDocument(small, useMl ? DETECTOR_OPTIONS : undefined);
          if (!cancelled) {
            cornersRef.current = result?.corners ?? null;
            setFound(Boolean(result?.corners));
          }
        }
      } catch {
        // A frame that fails to analyse is not worth reporting: the next one
        // is 160ms away, and an error toast per frame would be unusable.
      } finally {
        busyRef.current = false;
      }
    };

    const loop = () => {
      if (cancelled) return;
      void detect();
      paintOverlay();
      rafRef.current = requestAnimationFrame(loop);
    };

    const start = async () => {
      try {
        // Load the detector first: opening the camera and then failing to find
        // the library leaves a live preview that never outlines anything.
        const mod = await import('scanic');
        scanDocument = mod.scanDocument as typeof scanDocument;

        // Load the model before the first frame rather than on it: the
        // first call would otherwise stall while several megabytes arrive,
        // and the outline would appear seconds after the camera does.
        try {
          const warm = document.createElement("canvas");
          warm.width = 64; warm.height = 64;
          await scanDocument?.(warm, DETECTOR_OPTIONS);
        } catch {
          // The model could not be loaded — carry on with the classical
          // detector rather than leaving the camera without an outline.
          useMl = false;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // iOS will not play without this pair, and a stalled preview looks
          // like a broken camera rather than a missing attribute.
          video.setAttribute('playsinline', 'true');
          await video.play().catch(() => undefined);
        }

        setStarting(false);
        setReady(true);
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const denied = err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        setError(denied ? t('camera.denied') : t('camera.unavailable'));
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [paintOverlay, t]);

  /** Grabs the current frame at full sensor resolution. */
  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const frame = document.createElement('canvas');
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    const ctx = frame.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Corners come from the small copy; scale them up to the captured frame.
    const corners = cornersRef.current;
    const scale = video.videoWidth / DETECT_WIDTH;
    const scaled: Corners | null = corners
      ? {
          topLeft: { x: corners.topLeft.x * scale, y: corners.topLeft.y * scale },
          topRight: { x: corners.topRight.x * scale, y: corners.topRight.y * scale },
          bottomRight: { x: corners.bottomRight.x * scale, y: corners.bottomRight.y * scale },
          bottomLeft: { x: corners.bottomLeft.x * scale, y: corners.bottomLeft.y * scale },
        }
      : null;

    onCapture(frame, scaled);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={t('camera.title')}>
      <div className="flex items-center justify-between p-4 text-white shrink-0">
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-lg hover:bg-white/10">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <span className="text-sm font-medium">{t('camera.title')}</span>
        <span className="w-9" aria-hidden="true" />
      </div>

      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            <p className="text-sm">{t('camera.starting')}</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <p className="text-sm max-w-xs">{error}</p>
            <button type="button" onClick={onPickFile} className="cta-button !py-2 !px-4 !text-xs">
              <ImageUp className="w-4 h-4" aria-hidden="true" />
              {t('camera.usePhoto')}
            </button>
          </div>
        )}

        {ready && !error && (
          <p
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium
                       bg-black/60 text-white whitespace-nowrap"
            role="status"
          >
            {found ? t('camera.documentFound') : t('camera.searching')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-8 p-6 shrink-0" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={onPickFile}
          aria-label={t('camera.usePhoto')}
          className="p-3 rounded-xl text-white/80 hover:text-white hover:bg-white/10"
        >
          <ImageUp className="w-6 h-6" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={capture}
          disabled={!ready || Boolean(error)}
          aria-label={t('camera.capture')}
          className="w-18 h-18 rounded-full bg-white disabled:opacity-40 flex items-center justify-center
                     active:scale-95 transition-transform"
          style={{ width: '4.5rem', height: '4.5rem' }}
        >
          <Camera className="w-7 h-7 text-black" aria-hidden="true" />
        </button>

        <span className="w-12" aria-hidden="true" />
      </div>
    </div>
  );
}
