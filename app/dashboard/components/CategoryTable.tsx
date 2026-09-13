'use client';

import { useLanguage } from '@/lib/language-context';

interface CategoryItem {
  name: string;
  monthlySpending: number;
  contributionPercent: number;
  type: string;
}

export default function CategoryTable({ data }: { data: CategoryItem[] }) {
  const { t } = useLanguage();

  /**
   * The badge names the kind of cost. `type` is the stored enum, so an
   * unrecognised value falls back to itself rather than rendering a key.
   */
  const typeLabel = (type: string) =>
    type === 'COGS' ? t('categoryTable.typeCogs')
    : type === 'OPEX' ? t('categoryTable.typeOpex')
    : type;

  if (!data.length) {
    return (
      <div className="card-glass p-6">
        <h3 className="font-bold text-foreground mb-4">{t('categoryTable.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('categoryTable.empty')}</p>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-5">{t('categoryTable.title')}</h3>
      <div className="space-y-3">
        {data.map(cat => (
          <div key={cat.name} className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground truncate">{cat.name}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {typeLabel(cat.type)}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    €{cat.monthlySpending.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full gradient-bg transition-all duration-700"
                  style={{ width: `${Math.min(100, cat.contributionPercent)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
              {cat.contributionPercent.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
