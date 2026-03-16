'use client';

interface CategoryItem {
  name: string;
  monthlySpending: number;
  contributionPercent: number;
  type: string;
}

export default function CategoryTable({ data }: { data: CategoryItem[] }) {
  if (!data.length) {
    return (
      <div className="card-glass p-6">
        <h3 className="font-bold text-foreground mb-4">Custos por Categoria</h3>
        <p className="text-sm text-muted-foreground">Sem dados de categorias este mês.</p>
      </div>
    );
  }

  return (
    <div className="card-glass p-6">
      <h3 className="font-bold text-foreground mb-5">Custos por Categoria</h3>
      <div className="space-y-3">
        {data.map(cat => (
          <div key={cat.name} className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground truncate">{cat.name}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                    {cat.type}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    €{cat.monthlySpending.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
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
        ))}
      </div>
    </div>
  );
}
