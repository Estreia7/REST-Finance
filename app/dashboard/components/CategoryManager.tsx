'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Pencil, Plus, Tag, Users, X, EyeOff, Eye } from 'lucide-react';
import {
  getAllCategories,
  createCategory,
  renameCategory,
  setCategoryLabour,
  deactivateCategory,
} from '../category-actions';
import { useLanguage } from '@/lib/language-context';

type Category = {
  id: string;
  name: string;
  type: 'COGS' | 'OPEX' | 'REVENUE';
  isActive: boolean;
  isLabour: boolean;
  entryCount: number;
};

/**
 * Rename, retire and add cost categories.
 *
 * Retiring is not deleting: existing entries keep pointing at the category, so
 * past months keep both their labels and their totals. A retired category just
 * stops appearing when logging something new.
 */
export default function CategoryManager() {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<'COGS' | 'OPEX' | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const result = await getAllCategories();
    if ('data' in result && result.data) setCategories(result.data as Category[]);
    else if ('error' in result) toast.error(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRename = async (id: string) => {
    const name = draftName.trim();
    if (name.length < 2) return;

    setBusyId(id);
    const result = await renameCategory(id, name);
    setBusyId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    setEditingId(null);
    toast.success('Categoria renomeada.');
    load();
  };

  const handleToggleLabour = async (category: Category) => {
    setBusyId(category.id);
    const result = await setCategoryLabour(category.id, !category.isLabour);
    setBusyId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    load();
  };

  const handleDeactivate = async (category: Category) => {
    const message = category.entryCount > 0
      ? `"${category.name}" tem ${category.entryCount} lançamentos. Deixa de aparecer em novos custos, mas o histórico mantém-se. Continuar?`
      : `Desativar "${category.name}"?`;
    if (!confirm(message)) return;

    setBusyId(category.id);
    const result = await deactivateCategory(category.id);
    setBusyId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Categoria desativada.');
    load();
  };

  const handleAdd = async (type: 'COGS' | 'OPEX') => {
    const name = newName.trim();
    if (name.length < 2) return;

    const result = await createCategory({ name, type });
    if (result.error) {
      toast.error(result.error);
      return;
    }

    setAddingType(null);
    setNewName('');
    toast.success(t('owner.costForm.categoryCreated'));
    load();
  };

  if (loading) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        A carregar categorias...
      </div>
    );
  }

  const groups: { type: 'COGS' | 'OPEX'; title: string; hint: string }[] = [
    { type: 'COGS', title: 'Mercadorias', hint: 'O que compras para vender.' },
    { type: 'OPEX', title: 'Despesas operacionais', hint: 'Ordenados, renda, energia e afins.' },
  ];

  return (
    <div className="card-glass p-6">
      <div className="flex items-center gap-2 mb-1">
        <Tag className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-bold text-foreground">Categorias</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Renomeia ou desativa categorias. O histórico mantém-se sempre.
      </p>

      <div className="space-y-8">
        {groups.map(({ type, title, hint }) => {
          const items = categories.filter((c) => c.type === type);
          const active = items.filter((c) => c.isActive);
          const retired = items.filter((c) => !c.isActive);

          return (
            <div key={type}>
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAddingType(type); setNewName(''); }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline shrink-0"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  {t('owner.costForm.newCategory')}
                </button>
              </div>

              {addingType === type && (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAdd(type); }
                      if (e.key === 'Escape') setAddingType(null);
                    }}
                    placeholder={t('owner.costForm.newCategoryPlaceholder')}
                    className="input-field"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdd(type)}
                    disabled={newName.trim().length < 2}
                    className="cta-button shrink-0 px-4 py-2 text-xs disabled:opacity-50"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingType(null)}
                    className="shrink-0 p-2 text-muted-foreground hover:text-foreground"
                    aria-label={t('common.cancel')}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {active.map((category) => (
                  <li key={category.id} className="flex items-center gap-3 py-2.5">
                    {editingId === category.id ? (
                      <>
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRename(category.id); }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="input-field py-1.5 text-sm"
                          aria-label={`Novo nome para ${category.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(category.id)}
                          disabled={busyId === category.id}
                          className="shrink-0 p-1.5 text-success hover:bg-muted rounded-md"
                          aria-label={t('common.save')}
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="shrink-0 p-1.5 text-muted-foreground hover:bg-muted rounded-md"
                          aria-label={t('common.cancel')}
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-foreground truncate">
                          {category.name}
                        </span>

                        {category.isLabour && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-subtle text-primary-ink">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            Pessoal
                          </span>
                        )}

                        {category.entryCount > 0 && (
                          <span className="shrink-0 figure text-xs text-muted-foreground">
                            {category.entryCount}
                          </span>
                        )}

                        {/* Prime Cost is goods plus labour, so which OPEX
                            categories count as wages has to be settable. */}
                        {type === 'OPEX' && (
                          <button
                            type="button"
                            onClick={() => handleToggleLabour(category)}
                            disabled={busyId === category.id}
                            className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                            aria-label={
                              category.isLabour
                                ? `Deixar de marcar ${category.name} como pessoal`
                                : `Marcar ${category.name} como pessoal`
                            }
                            title="Contar como pessoal no Prime Cost"
                          >
                            <Users className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => { setEditingId(category.id); setDraftName(category.name); }}
                          className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                          aria-label={`Renomear ${category.name}`}
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeactivate(category)}
                          disabled={busyId === category.id}
                          className="shrink-0 p-1.5 text-muted-foreground hover:text-danger hover:bg-muted rounded-md"
                          aria-label={`Desativar ${category.name}`}
                        >
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {retired.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer">
                    {retired.length} desativada{retired.length > 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {retired.map((category) => (
                      <li key={category.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Eye className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{category.name}</span>
                        {category.entryCount > 0 && (
                          <span className="figure shrink-0">({category.entryCount})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
