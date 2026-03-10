'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CategoryItem {
  name: string;
  monthlyRevenue: number;
  contributionPercent: number;
  trend: number[];
}

export default function CategoryTable({ data }: { data: CategoryItem[] }) {
  if (!data.length) {
    return (
      <div className="card-glass p-6">
        <h3 className="font-bold text-foreground mb-4">Performance por Categoria</h3>
        <p className="text-sm text-muted-foreground">Sem dados de categorias.</p>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-5">Performance por Categoria</h3>
      <div className="space-y-3">
        {data.map(cat => {
          const trendVal = cat.trend.length >= 2
            ? cat.trend[cat.trend.length - 1] - cat.trend[cat.trend.length - 2]
            : 0;
          const TrendIcon = trendVal > 0 ? TrendingUp : trendVal < 0 ? TrendingDown : Minus;
          const trendColor = trendVal > 0 ? 'text-green-400' : trendVal < 0 ? 'text-red-400' : 'text-muted-foreground';

          return (
            <div key={cat.name} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{cat.name}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                    <span className="text-xs font-bold text-foreground">
                      €{cat.monthlyRevenue.toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
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
          );
        })}
      </div>
    </div>
  );
}
