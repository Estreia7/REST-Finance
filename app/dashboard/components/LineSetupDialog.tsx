'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import { getLineSetup, type LineSetupData } from '../line-setup-actions';
import Dialog from './Dialog';
import LineSetupCard from './LineSetupCard';

/** The same card, opened from a saved line to set it up or correct it. */
export default function LineSetupDialog({
  itemId, onClose, onSaved,
}: {
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<LineSetupData | null>(null);
  // A corrected purchase changes the list behind this, however it is closed.
  const corrected = useRef(false);
  const close = () => (corrected.current ? onSaved() : onClose());

  const load = useCallback(() => getLineSetup(itemId), [itemId]);

  useEffect(() => {
    let stale = false;
    load().then((result) => {
      if (stale) return;
      if ('error' in result) {
        toast.error(translateError(language, result.error ?? 'lineSetup.failed'));
        onClose();
      } else {
        setData(result.data);
      }
    });
    return () => { stale = true; };
  }, [load, language, onClose]);

  const line = data?.lines[0];

  return (
    <Dialog onClose={close} title={t('lineSetup.configure')}>
      {data && line ? (
        <LineSetupCard
          line={line}
          ingredients={data.ingredients}
          categories={data.categories}
          onSaved={onSaved}
          onCorrected={() => {
            corrected.current = true;
            load().then((result) => { if (!('error' in result)) setData(result.data); });
          }}
          onLater={close}
          laterLabel={t('lineSetup.cancel')}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('common.loading')}
        </div>
      )}
    </Dialog>
  );
}
