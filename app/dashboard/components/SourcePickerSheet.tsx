'use client';

import { useEffect, useRef } from 'react';
import { X, Camera, Images, FolderOpen } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

/**
 * Where the photograph is coming from, asked in the app's own voice.
 *
 * A bare `<input type="file">` on an iPhone opens Safari's own sheet —
 * "Fototeca / Tirar fotografia / Escolher ficheiro" — which is grey, in the
 * phone's language rather than the account's, and looks nothing like the rest
 * of the app. Worse, its camera option is the system camera: it takes a plain
 * photograph with none of the edge detection, automatic shutter or crop that
 * this app does.
 *
 * So the three choices are offered here instead. Two of them still open a
 * file input, because reaching the gallery or the files app is something only
 * the browser can do — but the camera option goes to our own camera, which is
 * the whole point.
 */

export type PhotoSource = 'camera' | 'gallery' | 'files';

interface SourcePickerSheetProps {
  onChoose: (source: PhotoSource) => void;
  onClose: () => void;
  /** Hidden when the device has no camera worth offering. */
  cameraAvailable?: boolean;
}

export default function SourcePickerSheet({
  onChoose,
  onClose,
  cameraAvailable = true,
}: SourcePickerSheetProps) {
  const { t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus moves into the sheet so a keyboard user is not
  // left behind on the page underneath.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-modal"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <h2 id="source-picker-title" className="font-semibold text-foreground truncate">
            {t('sourcePicker.title')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className={`grid gap-3 p-5 pt-2 ${cameraAvailable ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {cameraAvailable && (
            <Source
              icon={<Camera className="w-6 h-6" aria-hidden="true" />}
              label={t('sourcePicker.camera')}
              hint={t('sourcePicker.cameraHint')}
              // The one that does the work: our camera, not the system one.
              highlight
              onClick={() => onChoose('camera')}
            />
          )}
          <Source
            icon={<Images className="w-6 h-6" aria-hidden="true" />}
            label={t('sourcePicker.gallery')}
            hint={t('sourcePicker.galleryHint')}
            onClick={() => onChoose('gallery')}
          />
          <Source
            icon={<FolderOpen className="w-6 h-6" aria-hidden="true" />}
            label={t('sourcePicker.files')}
            hint={t('sourcePicker.filesHint')}
            onClick={() => onChoose('files')}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One of the three.
 *
 * The camera is tinted and the other two are not: it is the one that crops
 * and straightens by itself, and the difference is worth seeing before the
 * label is read.
 */
function Source({
  icon, label, hint, highlight, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border-subtle bg-card p-3
                 text-center transition-colors hover:border-primary hover:bg-muted/50
                 active:scale-[0.98]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={`flex items-center justify-center w-12 h-12 rounded-xl ${
          highlight ? 'gradient-bg text-white' : 'bg-muted text-foreground'
        }`}
      >
        {icon}
      </span>
      <span className="text-xs font-semibold text-foreground leading-tight">{label}</span>
      <span className="text-[11px] text-muted-foreground leading-snug">{hint}</span>
    </button>
  );
}
