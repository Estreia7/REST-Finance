'use client';

import { useEffect, useState } from 'react';
import { getTopIngredients } from '../product-actions';
import { useLanguage } from '@/lib/language-context';

/**
 * The ten extras the kitchen prepared most.
 *
 * Takes the place of the net-profit card on the dashboard, which said the
 * same thing the P&L says better and in more detail. This says something the
 * owner can act on today: what to have prepped, and what to stop ordering.
 *
 * Counted by times asked for, not by money. Every one of these rings at zero
 * on the till — they exist so the kitchen display knows what goes on the
 * burger — so ranking them by takings would put them all level at nothing.
 *
 * Drawn as a bar behind each name rather than as a number column: ten
 * quantities have to be read one at a time, ten bars are one glance. The
 * figure stays beside each bar for the reading a bar cannot give.
 */

interface Item {
  id: string;
  name: string;
  quantity: number;
}

export default function IngredientRanking() {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    getTopIngredients(10).then((r) => {
      setItems('data' in r && r.data ? r.data.items : []);
    });
  }, []);

  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';

  return (
    <div className="card-glass p-6">
      <div className="mb-4">
        <h3 className="font-bold text-foreground mb-1">{t('products.ingredientsTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('products.ingredientsSubtitle')}</p>
      </div>

      {items === null ? (
        // Ten rows at the real height, so the card does not jump when the
        // data lands.
        <ul className="space-y-2.5" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="h-4 rounded bg-muted/60 animate-pulse" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('products.ingredientsEmpty')}
        </p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((item, i) => {
            // Relative to the most-asked-for, so the shape of the ranking is
            // visible rather than every bar being nearly full.
            const share = (item.quantity / items[0].quantity) * 100;
            return (
              <li key={item.id} className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-4 shrink-0 text-right">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-xs font-medium text-foreground truncate">{item.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                      {item.quantity.toLocaleString(locale)}{' '}
                      <span className="sr-only">{t('products.ingredientsTimes')}</span>
                    </span>
                  </span>
                  <span
                    className="block h-1.5 rounded-full bg-primary/70"
                    style={{ width: `${Math.max(share, 2)}%` }}
                    aria-hidden="true"
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
