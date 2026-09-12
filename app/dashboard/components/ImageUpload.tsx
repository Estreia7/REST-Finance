'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Trash2, Building2, User } from 'lucide-react';

/**
 * Picks and uploads a logo or profile picture.
 *
 * Validates size and type in the browser for a quick answer, but the server
 * checks the file's magic bytes regardless: a client-side check is a
 * convenience, never a control.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export default function ImageUpload({
  currentPath,
  shape = 'square',
  kind,
  label,
  hint,
  onUpload,
  onRemove,
}: {
  /** Stored path, or an absolute URL for a Google profile picture. */
  currentPath: string | null;
  shape?: 'square' | 'circle';
  kind: 'logo' | 'avatar';
  label: string;
  hint: string;
  onUpload: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  onRemove: () => Promise<{ error?: string; success?: boolean }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const src = preview
    ?? (currentPath
      ? currentPath.startsWith('http')
        ? currentPath
        : `/api/images/${currentPath}`
      : null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        toast.error('Formato inválido. Usa PNG, JPG ou WebP.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('A imagem não pode exceder 2 MB.');
        return;
      }

      // Shown immediately so the change feels instant; replaced by the real
      // path once the upload lands.
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setBusy(true);

      const formData = new FormData();
      formData.append('file', file);
      const result = await onUpload(formData);

      setBusy(false);
      URL.revokeObjectURL(objectUrl);

      if (result.error) {
        setPreview(null);
        toast.error(result.error);
        return;
      }

      setPreview(null);
      toast.success('Imagem atualizada.');
    },
    [onUpload]
  );

  const handleRemove = async () => {
    setBusy(true);
    const result = await onRemove();
    setBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    setPreview(null);
    toast.success('Imagem removida.');
  };

  const Placeholder = kind === 'logo' ? Building2 : User;
  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div className="flex items-center gap-4">
      <div
        className={`relative w-20 h-20 shrink-0 ${rounded} border border-border bg-muted
                    flex items-center justify-center overflow-hidden`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- the source is
          // an authenticated route or a blob URL, neither of which next/image
          // can optimise.
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <Placeholder className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
        )}

        {busy && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary-ink" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline disabled:opacity-50"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            {src ? 'Alterar' : 'Carregar'}
          </button>

          {currentPath && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm text-danger hover:underline disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Remover
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so choosing the same file twice still fires a change.
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
