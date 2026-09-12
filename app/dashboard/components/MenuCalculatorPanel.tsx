'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, Pencil, X, Check, ChefHat, Carrot,
  AlertTriangle, TrendingUp, Receipt, Tag,
} from 'lucide-react';
import {
  getMenu, saveIngredient, deleteIngredient,
  saveMenuItem, deleteMenuItem, setRecipeLine, removeRecipeLine,
} from '../menu-actions';
import {
  VAT_RATES, PURCHASE_UNITS, RECIPE_UNITS, suggestedPrice,
  MENU_CLASS_LABEL, type MenuClass, type CostedLine,
} from '@/lib/menu-costing';
import { formatMoneyExact, formatPercent } from '@/lib/format';
import InfoHint from '@/app/components/InfoHint';

/**
 * What each dish costs and what it earns.
 *
 * Built around the number an owner cannot get from the accounts: the P&L says
 * food cost was 32% of revenue, but not which dish is carrying the room and
 * which is being sold at a loss. That answer needs the recipe, and the recipe
 * is why this is a separate tool rather than another chart.
 *
 * Ingredient prices come from the invoices already in the database wherever
 * they match, so a supplier's increase reaches the affected dishes without
 * anybody re-typing a price. That is the whole advantage over the spreadsheet
 * this replaces.
 */

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  manualUnitCost: number | null;
  invoiceUnitCost: number | null;
  invoiceCostAt: string | Date | null;
  wastePercent: number;
}

interface Costing {
  priceGross: number;
  priceNet: number;
  vatAmount: number;
  vatRate: number;
  foodCost: number;
  lines: CostedLine[];
  grossProfit: number;
  foodCostPercent: number | null;
  marginPercent: number | null;
  incomplete: boolean;
  missingCount: number;
}

interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  priceGross: number;
  vatRate: number;
  monthlyVolume: number | null;
  active: boolean;
  costing: Costing;
  menuClass: MenuClass | null;
}

interface MenuData {
  items: MenuItem[];
  ingredients: Ingredient[];
  averages: { grossProfit: number; volume: number };
}

/** Portuguese guidance puts restaurant food cost at 25–35% of net sales. */
const TARGET_FOOD_COST = 30;

export default function MenuCalculatorPanel() {
  const [data, setData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'menu' | 'ingredients'>('menu');

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [recipeFor, setRecipeFor] = useState<MenuItem | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getMenu().then((r) => {
      if (r.success) setData(r.data as unknown as MenuData);
      else toast.error(r.error);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, okMsg?: string) => {
    setBusy(true);
    const result = await fn();
    if (result.success) {
      if (okMsg) toast.success(okMsg);
      load();
    } else {
      toast.error(result.error || 'Não foi possível guardar');
    }
    setBusy(false);
    return result;
  };

  // Keep the open recipe dialog in step with a reload.
  useEffect(() => {
    if (!recipeFor || !data) return;
    const fresh = data.items.find((i) => i.id === recipeFor.id);
    if (fresh && fresh !== recipeFor) setRecipeFor(fresh);
  }, [data, recipeFor]);

  if (loading && !data) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        A carregar ementa...
      </div>
    );
  }

  const items = data?.items ?? [];
  const ingredients = data?.ingredients ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted w-fit">
        {([['menu', 'Ementa'], ['ingredients', 'Ingredientes']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={view === value}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'menu' ? (
        items.length === 0 ? (
          <EmptyMenu
            hasIngredients={ingredients.length > 0}
            onAdd={() => setAddingItem(true)}
            onIngredients={() => setView('ingredients')}
          />
        ) : (
          <>
            <MenuSummary items={items} />
            <div className="space-y-2">
              {items.map((item) => (
                <DishCard
                  key={item.id}
                  item={item}
                  onEdit={() => setEditingItem(item)}
                  onRecipe={() => setRecipeFor(item)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddingItem(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Adicionar prato
            </button>
          </>
        )
      ) : (
        <IngredientList
          ingredients={ingredients}
          onAdd={() => setAddingIngredient(true)}
          onEdit={setEditingIngredient}
        />
      )}

      {(addingItem || editingItem) && (
        <DishDialog
          item={editingItem}
          onClose={() => { setAddingItem(false); setEditingItem(null); }}
          onSave={async (input) => {
            await run(() => saveMenuItem({ id: editingItem?.id, ...input }), 'Prato guardado');
            setAddingItem(false);
            setEditingItem(null);
          }}
          onDelete={
            editingItem
              ? async () => {
                  if (!confirm(`Remover "${editingItem.name}" da ementa?`)) return;
                  await run(() => deleteMenuItem(editingItem.id), 'Prato removido');
                  setEditingItem(null);
                }
              : undefined
          }
        />
      )}

      {(addingIngredient || editingIngredient) && (
        <IngredientDialog
          ingredient={editingIngredient}
          onClose={() => { setAddingIngredient(false); setEditingIngredient(null); }}
          onSave={async (input) => {
            await run(
              () => saveIngredient({ id: editingIngredient?.id, ...input }),
              'Ingrediente guardado'
            );
            setAddingIngredient(false);
            setEditingIngredient(null);
          }}
          onDelete={
            editingIngredient
              ? async () => {
                  const result = await run(() => deleteIngredient(editingIngredient.id));
                  if (result.success) {
                    toast.success('Ingrediente removido');
                    setEditingIngredient(null);
                  }
                }
              : undefined
          }
        />
      )}

      {recipeFor && (
        <RecipeDialog
          item={recipeFor}
          ingredients={ingredients}
          busy={busy}
          onClose={() => setRecipeFor(null)}
          onAddLine={(ingredientId, quantity, unit) =>
            run(() => setRecipeLine({ menuItemId: recipeFor.id, ingredientId, quantity, unit }))
          }
          onRemoveLine={(ingredientId) =>
            run(() => removeRecipeLine(recipeFor.id, ingredientId))
          }
          onNewIngredient={() => { setRecipeFor(null); setView('ingredients'); setAddingIngredient(true); }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function MenuSummary({ items }: { items: MenuItem[] }) {
  const costed = items.filter((i) => !i.costing.incomplete && i.costing.lines.length > 0);
  if (costed.length === 0) return null;

  const avgFoodCost =
    costed.reduce((s, i) => s + (i.costing.foodCostPercent ?? 0), 0) / costed.length;

  // Weighted by volume where it is known: the average margin across dishes is
  // not the margin the restaurant earns, which depends on what actually sells.
  const withVolume = costed.filter((i) => i.monthlyVolume && i.monthlyVolume > 0);
  const monthlyProfit = withVolume.reduce(
    (s, i) => s + i.costing.grossProfit * (i.monthlyVolume ?? 0),
    0
  );

  const losing = costed.filter((i) => i.costing.grossProfit <= 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          Pratos custeados
        </div>
        <div className="text-xl font-bold text-foreground">
          {costed.length}<span className="text-sm text-muted-foreground">/{items.length}</span>
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          Food cost médio<InfoHint term="cogsPct" />
        </div>
        <div className={`text-xl font-bold ${avgFoodCost <= 32 ? 'text-green-400' : avgFoodCost <= 38 ? 'text-amber-400' : 'text-red-400'}`}>
          {formatPercent(avgFoodCost)}
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          Margem estimada/mês
        </div>
        <div className="text-xl font-bold text-foreground">
          {withVolume.length > 0 ? formatMoneyExact(monthlyProfit) : '—'}
        </div>
        {withVolume.length === 0 && (
          <div className="text-[10px] text-muted-foreground mt-0.5">Indique as vendas mensais</div>
        )}
      </div>

      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          A dar prejuízo
        </div>
        <div className={`text-xl font-bold ${losing.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {losing.length}
        </div>
      </div>
    </div>
  );
}

function DishCard({
  item, onEdit, onRecipe,
}: {
  item: MenuItem;
  onEdit: () => void;
  onRecipe: () => void;
}) {
  const c = item.costing;
  const hasRecipe = c.lines.length > 0;
  const suggested = suggestedPrice(c.foodCost, TARGET_FOOD_COST, item.vatRate);

  const tone =
    !hasRecipe ? 'text-muted-foreground'
      : c.grossProfit <= 0 ? 'text-red-400'
      : (c.foodCostPercent ?? 0) <= 32 ? 'text-green-400'
      : (c.foodCostPercent ?? 0) <= 38 ? 'text-amber-400'
      : 'text-red-400';

  return (
    <div className="card-glass p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-foreground truncate">{item.name}</h4>
            {item.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                {item.category}
              </span>
            )}
            {item.menuClass && <MenuClassBadge menuClass={item.menuClass} />}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMoneyExact(item.priceGross)} na ementa · IVA {formatPercent(item.vatRate, 0)} ·{' '}
            {formatMoneyExact(c.priceNet)} sem IVA
            {item.monthlyVolume ? ` · ~${item.monthlyVolume}/mês` : ''}
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          aria-label={`Editar ${item.name}`}
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {hasRecipe ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Figure label="Custo do prato" value={formatMoneyExact(c.foodCost)} />
            <Figure
              label="Margem bruta"
              value={formatMoneyExact(c.grossProfit)}
              tone={c.grossProfit <= 0 ? 'text-red-400' : 'text-green-400'}
            />
            <Figure
              label="Food cost"
              value={c.foodCostPercent === null ? '—' : formatPercent(c.foodCostPercent)}
              tone={tone}
            />
          </div>

          {c.incomplete && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
              {c.missingCount} ingrediente{c.missingCount > 1 ? 's' : ''} sem preço — o custo real é
              mais alto do que o mostrado.
            </p>
          )}

          {c.grossProfit <= 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
              Este prato não paga os próprios ingredientes.
              {suggested && ` Para 30% de food cost, teria de custar ${formatMoneyExact(suggested)}.`}
            </p>
          )}

          {c.grossProfit > 0 && (c.foodCostPercent ?? 0) > 38 && suggested && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Para 30% de food cost, o preço seria{' '}
              <strong className="text-foreground">{formatMoneyExact(suggested)}</strong>.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Sem receita — adicione os ingredientes para saber a margem.
        </p>
      )}

      <button
        type="button"
        onClick={onRecipe}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <ChefHat className="w-3.5 h-3.5" aria-hidden="true" />
        {hasRecipe ? `Receita (${c.lines.length})` : 'Criar receita'}
      </button>
    </div>
  );
}

function Figure({ label, value, tone = 'text-foreground' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function MenuClassBadge({ menuClass }: { menuClass: MenuClass }) {
  const styles: Record<MenuClass, string> = {
    star: 'bg-success/15 text-green-400',
    plowhorse: 'bg-info/15 text-info',
    puzzle: 'bg-warning/15 text-amber-400',
    dog: 'bg-danger/15 text-red-400',
  };
  const { label, advice } = MENU_CLASS_LABEL[menuClass];
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${styles[menuClass]}`}
      title={advice}
    >
      {label}
    </span>
  );
}

function EmptyMenu({
  hasIngredients, onAdd, onIngredients,
}: {
  hasIngredients: boolean;
  onAdd: () => void;
  onIngredients: () => void;
}) {
  return (
    <div className="card-glass p-8 text-center">
      <ChefHat className="w-8 h-8 mx-auto text-muted-foreground/40" aria-hidden="true" />
      <h4 className="mt-3 font-semibold text-foreground">A ementa ainda está vazia</h4>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
        Adicione um prato com o preço que está na ementa. Depois monte a receita e
        fica a saber quanto é que ele deixa, já com o IVA descontado.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        <button type="button" onClick={onAdd} className="cta-button !py-2 !px-4 !text-sm">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Adicionar prato
        </button>
        {!hasIngredients && (
          <button type="button" onClick={onIngredients} className="cta-button-secondary !py-2 !px-4 !text-sm">
            <Carrot className="w-4 h-4" aria-hidden="true" />
            Começar pelos ingredientes
          </button>
        )}
      </div>
    </div>
  );
}

function IngredientList({
  ingredients, onAdd, onEdit,
}: {
  ingredients: Ingredient[];
  onAdd: () => void;
  onEdit: (i: Ingredient) => void;
}) {
  return (
    <div className="card-glass p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="font-semibold text-foreground">Ingredientes</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Os preços vêm das facturas sempre que o nome coincide. Escreva o preço
            à mão só para o que não passa por factura.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="cta-button !py-2 !px-3 !text-xs shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Novo
        </button>
      </div>

      {ingredients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ainda não há ingredientes.
        </p>
      ) : (
        <div className="-mx-4 sm:-mx-5 divide-y divide-border-subtle border-y border-border-subtle">
          {ingredients.map((ing) => {
            const fromInvoice = ing.manualUnitCost === null && ing.invoiceUnitCost !== null;
            const cost = ing.manualUnitCost ?? ing.invoiceUnitCost;
            return (
              <button
                key={ing.id}
                type="button"
                onClick={() => onEdit(ing)}
                className="w-full min-h-[56px] px-4 sm:px-5 py-3 flex items-center gap-3 text-left
                           hover:bg-muted/50 active:bg-muted transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">{ing.name}</span>
                  <span className="block text-[11px] text-muted-foreground flex items-center gap-1">
                    {cost === null ? (
                      <span className="text-warning">Sem preço</span>
                    ) : (
                      <>
                        {fromInvoice ? (
                          <Receipt className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Tag className="w-3 h-3" aria-hidden="true" />
                        )}
                        {fromInvoice ? 'da factura' : 'preço fixo'}
                        {ing.wastePercent > 0 && ` · ${formatPercent(ing.wastePercent, 0)} de perda`}
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                  {cost === null ? '—' : `${formatMoneyExact(cost)}/${ing.unit}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DishDialog({
  item, onClose, onSave, onDelete,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onSave: (input: {
    name: string; category: string | null; priceGross: number;
    vatRate: number; monthlyVolume: number | null;
  }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [price, setPrice] = useState(item ? String(item.priceGross) : '');
  const [vatRate, setVatRate] = useState(item?.vatRate ?? 13);
  const [volume, setVolume] = useState(item?.monthlyVolume ? String(item.monthlyVolume) : '');

  const priceValue = Number(price.replace(',', '.'));
  const valid = name.trim().length > 0 && Number.isFinite(priceValue) && priceValue >= 0;

  return (
    <Dialog onClose={onClose} title={item ? 'Editar prato' : 'Novo prato'}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">Nome</span>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          maxLength={80} autoFocus placeholder="ex: Bacalhau à Brás"
          className="input-field !py-2"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">Secção (opcional)</span>
        <input
          type="text" value={category} onChange={(e) => setCategory(e.target.value)}
          maxLength={40} placeholder="ex: Peixe, Sobremesas, Bebidas"
          className="input-field !py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            Preço na ementa
            <span className="block text-[10px] opacity-70">com IVA</span>
          </span>
          <input
            type="text" inputMode="decimal" value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="12,50" className="input-field !py-2"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            IVA
            <span className="block text-[10px] opacity-70">13% comida, 23% álcool</span>
          </span>
          <select
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value))}
            className="input-field !py-2"
          >
            {VAT_RATES.map((v) => (
              <option key={v.rate} value={v.rate}>{v.rate}%</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">
          Quantos vende por mês? (opcional)
          <span className="block text-[10px] opacity-70">
            Serve para saber que pratos sustentam a casa
          </span>
        </span>
        <input
          type="number" min={0} value={volume}
          onChange={(e) => setVolume(e.target.value)}
          placeholder="ex: 120" className="input-field !py-2 w-32"
        />
      </label>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() =>
            valid && onSave({
              name: name.trim(),
              category: category.trim() || null,
              priceGross: priceValue,
              vatRate,
              monthlyVolume: volume.trim() === '' ? null : Number(volume),
            })
          }
          disabled={!valid}
          className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          Guardar
        </button>
        {onDelete && (
          <button
            type="button" onClick={onDelete}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label="Remover prato"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </Dialog>
  );
}

function IngredientDialog({
  ingredient, onClose, onSave, onDelete,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSave: (input: {
    name: string; unit: string; manualUnitCost: number | null; wastePercent: number;
  }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? 'kg');
  const [useInvoice, setUseInvoice] = useState(ingredient ? ingredient.manualUnitCost === null : true);
  const [cost, setCost] = useState(
    ingredient?.manualUnitCost !== null && ingredient?.manualUnitCost !== undefined
      ? String(ingredient.manualUnitCost)
      : ''
  );
  const [waste, setWaste] = useState(String(ingredient?.wastePercent ?? 0));

  const costValue = Number(cost.replace(',', '.'));
  const valid =
    name.trim().length > 0 && (useInvoice || (Number.isFinite(costValue) && costValue >= 0));

  return (
    <Dialog onClose={onClose} title={ingredient ? 'Editar ingrediente' : 'Novo ingrediente'}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">Nome</span>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          maxLength={60} autoFocus placeholder="ex: Bacalhau"
          className="input-field !py-2"
        />
        <span className="block text-[10px] text-muted-foreground mt-1">
          Use o mesmo nome que aparece nas facturas, para o preço vir de lá sozinho.
        </span>
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">Como compra</span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input-field !py-2 w-32">
          {PURCHASE_UNITS.map((u) => (
            <option key={u} value={u}>por {u}</option>
          ))}
        </select>
      </label>

      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <span className="text-xs text-muted-foreground block mb-2">Preço</span>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio" checked={useInvoice} onChange={() => setUseInvoice(true)}
            className="mt-0.5" name="costSource"
          />
          <span className="min-w-0">
            <span className="block text-sm text-foreground">Usar o preço das facturas</span>
            <span className="block text-[11px] text-muted-foreground">
              {ingredient?.invoiceUnitCost != null
                ? `Actualmente ${formatMoneyExact(ingredient.invoiceUnitCost)}/${ingredient.unit}. Actualiza-se sozinho.`
                : 'Ainda não há facturas com este nome — o preço fica em falta até haver.'}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer mt-3">
          <input
            type="radio" checked={!useInvoice} onChange={() => setUseInvoice(false)}
            className="mt-0.5" name="costSource"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-foreground">Escrever o preço</span>
            <span className="block text-[11px] text-muted-foreground mb-2">
              Para o que não passa por factura: azeite ao fio, temperos, compras a dinheiro.
            </span>
            {!useInvoice && (
              <span className="flex items-center gap-2">
                <input
                  type="text" inputMode="decimal" value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="12,50" className="input-field !py-1.5 !text-sm w-28"
                />
                <span className="text-xs text-muted-foreground">€ por {unit}</span>
              </span>
            )}
          </span>
        </label>
      </div>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">
          Perda e desperdício
          <span className="block text-[10px] opacity-70">
            Aparas, espinhas, cascas. 1 kg comprado não é 1 kg no prato.
          </span>
        </span>
        <span className="flex items-center gap-2">
          <input
            type="number" min={0} max={99} value={waste}
            onChange={(e) => setWaste(e.target.value)}
            className="input-field !py-1.5 !text-sm w-24"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </span>
      </label>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() =>
            valid && onSave({
              name: name.trim(),
              unit,
              manualUnitCost: useInvoice ? null : costValue,
              wastePercent: Number(waste) || 0,
            })
          }
          disabled={!valid}
          className="cta-button flex-1 !py-2.5 !text-sm disabled:opacity-40"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          Guardar
        </button>
        {onDelete && (
          <button
            type="button" onClick={onDelete}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label="Remover ingrediente"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </Dialog>
  );
}

function RecipeDialog({
  item, ingredients, busy, onClose, onAddLine, onRemoveLine, onNewIngredient,
}: {
  item: MenuItem;
  ingredients: Ingredient[];
  busy: boolean;
  onClose: () => void;
  onAddLine: (ingredientId: string, quantity: number, unit: string) => Promise<unknown>;
  onRemoveLine: (ingredientId: string) => Promise<unknown>;
  onNewIngredient: () => void;
}) {
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('g');

  const used = new Set(item.costing.lines.map((l) => l.ingredientId));
  const available = ingredients.filter((i) => !used.has(i.id));
  const quantityValue = Number(quantity.replace(',', '.'));
  const canAdd = ingredientId !== '' && Number.isFinite(quantityValue) && quantityValue > 0;

  return (
    <Dialog onClose={onClose} title={`Receita — ${item.name}`}>
      {item.costing.lines.length > 0 && (
        <div className="-mx-5 mb-4 divide-y divide-border-subtle border-y border-border-subtle">
          {item.costing.lines.map((line) => (
            <div key={line.ingredientId} className="px-5 py-2.5 flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground truncate">{line.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {line.quantity} {line.unit}
                  {line.problem === 'no-price' && (
                    <span className="text-warning"> · sem preço</span>
                  )}
                  {line.problem === 'bad-unit' && (
                    <span className="text-warning"> · unidade incompatível</span>
                  )}
                  {line.source === 'invoice' && ' · da factura'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                {line.cost === null ? '—' : formatMoneyExact(line.cost)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveLine(line.ingredientId)}
                disabled={busy}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-muted"
                aria-label={`Remover ${line.name}`}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 ? (
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs text-muted-foreground block mb-2">Adicionar ingrediente</span>
          <select
            value={ingredientId}
            onChange={(e) => {
              setIngredientId(e.target.value);
              // Follow how the thing is bought: something sold by the unit is
              // counted in units, not weighed in grams.
              const picked = ingredients.find((i) => i.id === e.target.value);
              if (picked) setUnit(picked.unit === 'un' ? 'un' : picked.unit === 'L' ? 'ml' : 'g');
            }}
            className="input-field !py-2 !text-sm w-full"
          >
            <option value="">Escolher...</option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>

          <div className="mt-2 flex gap-2">
            <input
              type="text" inputMode="decimal" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="150" className="input-field !py-2 !text-sm flex-1"
            />
            <select
              value={unit} onChange={(e) => setUnit(e.target.value)}
              className="input-field !py-2 !text-sm w-24"
            >
              {RECIPE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                await onAddLine(ingredientId, quantityValue, unit);
                setIngredientId('');
                setQuantity('');
              }}
              disabled={!canAdd || busy}
              className="cta-button !py-2 !px-3 !text-xs disabled:opacity-40 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onNewIngredient}
          className="w-full rounded-xl border border-dashed border-border py-3 text-xs
                     font-semibold text-primary hover:bg-muted transition-colors"
        >
          <Plus className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
          {ingredients.length === 0 ? 'Criar o primeiro ingrediente' : 'Criar outro ingrediente'}
        </button>
      )}

      {/* The running total, where the owner is deciding. */}
      {item.costing.lines.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface border border-border-subtle p-3 space-y-1.5 text-sm">
          <Row label="Preço na ementa" value={formatMoneyExact(item.costing.priceGross)} />
          <Row
            label={`IVA ${formatPercent(item.vatRate, 0)}`}
            value={`-${formatMoneyExact(item.costing.vatAmount)}`}
            tone="text-muted-foreground"
          />
          <Row label="Preço sem IVA" value={formatMoneyExact(item.costing.priceNet)} />
          <Row
            label="Custo dos ingredientes"
            value={`-${formatMoneyExact(item.costing.foodCost)}`}
            tone="text-red-400"
          />
          <div className="pt-1.5 border-t border-border">
            <Row
              label="Margem bruta"
              value={formatMoneyExact(item.costing.grossProfit)}
              tone={item.costing.grossProfit <= 0 ? 'text-red-400' : 'text-green-400'}
              bold
            />
          </div>
          {item.costing.foodCostPercent !== null && (
            <Row
              label="Food cost"
              value={formatPercent(item.costing.foodCostPercent)}
              tone="text-muted-foreground"
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

function Row({
  label, value, tone = 'text-foreground', bold = false,
}: {
  label: string; value: string; tone?: string; bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'text-sm'} ${tone}`}>{value}</span>
    </div>
  );
}

/** Same shape as the schedule's dialog: bottom sheet on a phone, centred above. */
function Dialog({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl
                   p-5 shadow-modal max-h-[90vh] overflow-y-auto
                   pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="font-bold text-foreground">{title}</h4>
          <button
            type="button" onClick={onClose}
            className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
