'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles, ChefHat, Carrot, X } from 'lucide-react';
import { previewCatalogueImport, commitCatalogueImport, type CataloguePreview } from '../catalogue-actions';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';

/**
 * Filling the Ementa from the till's own catalogue.
 *
 * Everything needed to cost a menu exists; it stays empty because the way in
 * is typing two hundred products by hand. The POS import already knows those
 * two hundred and what each sells for.
 *
 * Shown before it writes, because two hundred rows appearing in someone's
 * menu unannounced is not something to undo by hand. The preview says what
 * each product will become and why, and the owner can close it and type the
 * menu themselves instead.
 */
export default function CatalogueImport({ onImported }: { onImported: () => void }) {
  const { t, language } = useLanguage();
  const [preview, setPreview] = useState<CataloguePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  const load = async () => {
    setLoading(true);
    const result = await previewCatalogueImport();
    setLoading(false);
    if ('error' in result) {
      toast.error(result.error ? t(result.error) : t('errors.read'));
      return;
    }
    setPreview(result.data);
  };

  const commit = async () => {
    setImporting(true);
    const result = await commitCatalogueImport();
    setImporting(false);
    if ('error' in result) {
      toast.error(result.error ? t(result.error) : t('errors.write'));
      return;
    }
    const { itemsCreated, ingredientsCreated } = result.data;
    toast.success(
      t('catalogue.imported')
        .replace('{items}', String(itemsCreated))
        .replace('{ingredients}', String(ingredientsCreated)),
    );
    setPreview(null);
    onImported();
  };

  if (!preview) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="cta-button-secondary !py-2 !px-4 !text-sm"
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          : <Sparkles className="w-4 h-4" aria-hidden="true" />}
        {t('catalogue.fromPos')}
      </button>
    );
  }

  const { menuItems, ingredients, skipped } = preview;

  return (
    <div className="card-glass p-6 text-left">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h4 className="font-bold text-foreground">{t('catalogue.title')}</h4>
        <button
          type="button"
          onClick={() => setPreview(null)}
          aria-label={t('common.close')}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{t('catalogue.intro')}</p>

      {/* What it will do, in the owner's own products. The counts alone would
          be asking them to trust it blindly. */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <Group
          icon={<ChefHat className="w-4 h-4" aria-hidden="true" />}
          title={t('catalogue.asMenuItems').replace('{n}', String(menuItems.length))}
          hint={t('catalogue.asMenuItemsHint')}
          rows={menuItems.slice(0, 6).map((d) => ({
            key: d.id,
            name: d.menuName,
            right: d.priceGross === null ? '—' : formatMoney(d.priceGross),
          }))}
          more={Math.max(0, menuItems.length - 6)}
          moreLabel={t('catalogue.andMore')}
        />
        <Group
          icon={<Carrot className="w-4 h-4" aria-hidden="true" />}
          title={t('catalogue.asIngredients').replace('{n}', String(ingredients.length))}
          hint={t('catalogue.asIngredientsHint')}
          rows={ingredients.slice(0, 6).map((i) => ({
            key: i.id,
            name: i.menuName,
            right: `${i.quantity.toLocaleString(locale)} ${t('products.unitsShort')}`,
          }))}
          more={Math.max(0, ingredients.length - 6)}
          moreLabel={t('catalogue.andMore')}
        />
      </div>

      {skipped.length > 0 && (
        <p className="text-xs text-muted-foreground mb-5">
          {t('catalogue.skipped').replace('{n}', String(skipped.length))}
        </p>
      )}

      {(preview.existingMenuItems > 0 || preview.existingIngredients > 0) && (
        // A second run after a new POS import adds what is new; anything the
        // owner has since corrected by hand stays corrected.
        <p className="text-xs text-muted-foreground mb-5">{t('catalogue.keepsExisting')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={importing || (menuItems.length === 0 && ingredients.length === 0)}
          className="cta-button !py-2 !px-4 !text-sm"
        >
          {importing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {t('catalogue.confirm')}
        </button>
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="cta-button-secondary !py-2 !px-4 !text-sm"
        >
          {t('common.cancel')}
        </button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{t('catalogue.recipeNote')}</p>
    </div>
  );
}

/** One side of the preview: what these products become, and a sample. */
function Group({
  icon, title, hint, rows, more, moreLabel,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  rows: Array<{ key: string; name: string; right: string }>;
  more: number;
  moreLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center gap-2 text-foreground mb-1">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground truncate">{row.name}</span>
              <span className="text-foreground tabular-nums shrink-0">{row.right}</span>
            </li>
          ))}
          {more > 0 && (
            <li className="text-xs text-muted-foreground pt-1">
              {moreLabel.replace('{n}', String(more))}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
