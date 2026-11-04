'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let stale = false;
    getLineSetup(itemId).then((result) => {
      if (stale) return;
      if ('error' in result) {
        toast.error(translateError(language, result.error ?? 'lineSetup.failed'));
        onClose();
      } else {
        setData(result.data);
      }
    });
    return () => { stale = true; };
  }, [itemId, language, onClose]);

  const line = data?.lines[0];

  return (
    <Dialog onClose={onClose} title={t('lineSetup.configure')}>
      {data && line ? (
        <LineSetupCard
          line={line}
          ingredients={data.ingredients}
          categories={data.categories}
          onSaved={onSaved}
          onLater={onClose}
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
