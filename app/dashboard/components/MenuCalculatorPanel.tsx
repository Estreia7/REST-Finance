'use client';

import { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, Pencil, X, Check, ChefHat, Carrot,
  AlertTriangle, Receipt, Tag, Search, ListChecks, ShoppingBag, ArrowLeftRight,
} from 'lucide-react';
import {
  getMenu, saveIngredient, deleteIngredient,
  saveMenuItem, deleteMenuItem, setRecipeLine, removeRecipeLine, addIngredientToItems,
  sellAsBought, stopSellingAsBought,
} from '../menu-actions';
import {
  VAT_RATES, PURCHASE_UNITS, RECIPE_UNITS, suggestedPrice, recipeUnitsFor,
  type MenuClass, type CostedLine,
} from '@/lib/menu-costing';
import { formatMoneyExact, formatPercent } from '@/lib/format';
import { useLanguage } from '@/lib/language-context';
import { translateError } from '@/lib/error-messages';
import CatalogueImport from './CatalogueImport';
import MenuGraph from './MenuGraph';
import ListSearch, { matchesSearch } from './ListSearch';
import IngredientPriceHistory from './IngredientPriceHistory';
import IngredientSources from './IngredientSources';
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
  /**
   * Set when this exists to cost an item sold as bought, naming that item.
   * Those rows are kept out of the ingredient list and the recipe picker: a
   * bottle of Super Bock is not something that goes into a burger.
   */
  soldAsId: string | null;
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
  /** Set when costed from one purchase instead of a recipe. */
  purchase: { cost: number | null; source: CostedLine['source'] } | null;
}

interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  priceGross: number;
  vatRate: number;
  monthlyVolume: number | null;
  active: boolean;
  costingMode: 'RECIPE' | 'PURCHASE';
  purchaseItemId: string | null;
  purchaseItemName: string | null;
  purchaseInvoiceCostAt: string | Date | null;
  /** We could not tell whether the kitchen makes this. The owner can. */
  needsReview: boolean;
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

/**
 * The compact field used inside the dish cards. Not `.input-field`: that one
 * is `width: 100%` outside any layer, so it beats a `w-20` and a unit select
 * ends up eating the whole row while the quantity beside it collapses to
 * nothing.
 */
const FIELD =
  'h-10 sm:h-9 rounded-lg border border-border bg-input px-2.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 ' +
  'focus:border-primary/50 disabled:opacity-50 transition-colors';

/** Case- and accent-blind, so "pao" finds "Pão Hamburguer". */
function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** A positive quantity, read the way it is typed here: "0,5" as well as "0.5". */
function parseQuantity(value: string): number | null {
  const n = Number(value.replace(',', '.').trim());
  return value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

function formatQuantity(value: number, language: string): string {
  const s = String(Number(value.toFixed(3)));
  return language === 'pt' ? s.replace('.', ',') : s;
}

/** Ingredient cost per purchase unit, invoice or pinned, for the picker. */
function unitCostOf(ing: Ingredient): number | null {
  return ing.manualUnitCost ?? ing.invoiceUnitCost;
}

export default function MenuCalculatorPanel() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'menu' | 'ingredients' | 'map'>('menu');

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');

  const [query, setQuery] = useState('');
  const [section, setSection] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  // Narrows the list to what we are unsure about, so the owner can work
  // through them without the rest of the menu in the way.
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const load = useCallback(() => {
    setLoading(true);
    getMenu().then((r) => {
      if (r.success) setData(r.data as unknown as MenuData);
      else toast.error(translateError(language, r.error));
      setLoading(false);
    });
  }, [language]);

  useEffect(() => { load(); }, [load]);

  const run = async (
    fn: () => Promise<{ success: boolean; error?: string }>,
    okMsg?: string
  ): Promise<boolean> => {
    setBusy(true);
    const result = await fn();
    if (result.success) {
      if (okMsg) toast.success(okMsg);
      load();
    } else {
      toast.error(result.error ? translateError(language, result.error) : t('menuCalc.saveFailed'));
    }
    setBusy(false);
    return result.success;
  };

  const createIngredient = (name: string) => {
    setNewIngredientName(name);
    setAddingIngredient(true);
  };

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  if (loading && !data) {
    return (
      <div className="card-glass p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {t('menuCalc.loading')}
      </div>
    );
  }

  const items = data?.items ?? [];
  const ingredients = data?.ingredients ?? [];
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  // What may go into a recipe. A bottle of Super Bock exists to cost the
  // drink sold as it, and offering it here would let the owner put a beer
  // inside a burger -- rebuilding by hand the confusion this cleared up.
  const recipeIngredients = ingredients.filter((i) => i.soldAsId === null);

  // Sections in the order the menu itself has them; dishes without one last.
  const sectionOf = (item: MenuItem) => item.category?.trim() || '';
  const sectionCounts = new Map<string, number>();
  for (const item of items) {
    const key = sectionOf(item);
    sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
  }
  const sections = Array.from(sectionCounts.keys()).sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : 0
  );
  const sectionLabel = (key: string) => key || t('menuCalc.noSection');

  const toReview = items.filter((i) => i.needsReview);

  const q = searchKey(query);
  const visible = items.filter(
    (item) =>
      (section === null || sectionOf(item) === section) &&
      (q === '' || searchKey(item.name).includes(q)) &&
      (!reviewOnly || item.needsReview)
  );
  const groups = sections
    .map((key) => ({ key, items: visible.filter((i) => sectionOf(i) === key) }))
    .filter((g) => g.items.length > 0);

  const selectedIds = items.filter((i) => selected.has(i.id)).map((i) => i.id);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted w-fit">
        {([['menu', t('menuCalc.tabMenu')], ['ingredients', t('menuCalc.tabProducts')], ['map', t('menuGraph.title')]] as const).map(([value, label]) => (
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

      {view === 'map' ? <MenuGraph /> : view === 'menu' ? (
        items.length === 0 ? (
          <EmptyMenu
            hasIngredients={ingredients.length > 0}
            onAdd={() => setAddingItem(true)}
            onIngredients={() => setView('ingredients')}
            onImported={load}
          />
        ) : (
          <>
            <MenuSummary items={items} />

            {/* The one question the data could not answer, asked once.
                A list rather than a dialog per item: a shelf of drinks is
                settled in a minute when they are all on screen together, and
                one modal at a time is how a thirty-item chore gets abandoned
                half done. */}
            {toReview.length > 0 && (
              <div className="card-glass p-4 border-warning/40 bg-warning/5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {t('menuCalc.reviewTitle').replace('{n}', String(toReview.length))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('menuCalc.reviewBody')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewOnly((v) => !v)}
                    aria-pressed={reviewOnly}
                    className={`shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        reviewOnly
                          ? 'border-primary/60 bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                  >
                    {reviewOnly ? t('menuCalc.reviewShowAll') : t('menuCalc.reviewShowThese')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[12rem]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                  placeholder={t('menuCalc.searchDishes')}
                  aria-label={t('menuCalc.searchAria')}
                  enterKeyHint="search"
                  className={`${FIELD} !h-10 w-full pl-9 pr-9`}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={t('menuCalc.clearSearch')}
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                aria-pressed={selecting}
                className={`h-10 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                  selecting
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <ListChecks className="w-4 h-4" aria-hidden="true" />
                {selecting ? t('menuCalc.doneSelecting') : t('menuCalc.select')}
              </button>
              <button
                type="button"
                onClick={() => setAddingItem(true)}
                className="cta-button !h-10 !py-0 !px-3 !text-xs"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('menuCalc.addDish')}
              </button>
            </div>

            {sections.length > 1 && (
              <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto no-scrollbar">
                {[null, ...sections].map((key) => {
                  const active = section === key;
                  return (
                    <button
                      key={key ?? '__all'}
                      type="button"
                      onClick={() => setSection(key)}
                      aria-pressed={active}
                      className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {key === null ? t('menuCalc.allSections') : sectionLabel(key)}
                      <span className="ml-1.5 tabular-nums opacity-70">
                        {key === null ? items.length : sectionCounts.get(key)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {groups.length === 0 ? (
              <p className="card-glass p-6 text-center text-sm text-muted-foreground">
                {t('menuCalc.noResults').replace('{q}', query.trim())}
              </p>
            ) : (
              groups.map((group) => {
                const ids = group.items.map((i) => i.id);
                const allOn = ids.every((id) => selected.has(id));
                return (
                  <section key={group.key || '__none'} aria-label={sectionLabel(group.key)} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        {sectionLabel(group.key)}
                        <span className="ml-2 font-semibold tabular-nums opacity-60">{group.items.length}</span>
                      </h3>
                      {selecting && (
                        <button
                          type="button"
                          onClick={() => toggle(ids, !allOn)}
                          className="text-xs font-semibold text-primary-ink hover:underline"
                        >
                          {allOn ? t('menuCalc.clearSection') : t('menuCalc.selectSection')}
                        </button>
                      )}
                    </div>
                    {group.items.map((item) => (
                      <DishCard
                        key={item.id}
                        item={item}
                        ingredients={recipeIngredients}
                        ingredientById={ingredientById}
                        busy={busy}
                        selecting={selecting}
                        isSelected={selected.has(item.id)}
                        onToggle={(on) => toggle([item.id], on)}
                        onEdit={() => setEditingItem(item)}
                        onEditIngredient={setEditingIngredient}
                        onCreateIngredient={createIngredient}
                        onSetLine={(ingredientId, quantity, unit) =>
                          run(() => setRecipeLine({ menuItemId: item.id, ingredientId, quantity, unit }))
                        }
                        onRemoveLine={(ingredientId) =>
                          run(() => removeRecipeLine(item.id, ingredientId))
                        }
                        onAnswer={(costingMode) =>
                          run(
                            () =>
                              saveMenuItem({
                                id: item.id,
                                name: item.name,
                                category: item.category,
                                priceGross: item.priceGross,
                                vatRate: item.vatRate,
                                monthlyVolume: item.monthlyVolume,
                                costingMode,
                              }),
                            // Says what it did, because the row's own change
                            // -- a recipe box appearing, or not -- is easy to
                            // miss on a long list.
                            costingMode === 'RECIPE'
                              ? t('menuCalc.reviewSavedMade')
                              : t('menuCalc.reviewSavedBought')
                          )
                        }
                      />
                    ))}
                  </section>
                );
              })
            )}

            {selecting && selectedIds.length > 0 && (
              <>
                {/* Room for the bar, so the last dish can still be reached. */}
                <div className="h-48" aria-hidden="true" />
                <BulkBar
                  count={selectedIds.length}
                  ingredients={recipeIngredients}
                  busy={busy}
                  onCancel={stopSelecting}
                  onCreateIngredient={createIngredient}
                  onAdd={async (ingredientId, quantity, unit) => {
                    const ok = await run(
                      () => addIngredientToItems({ menuItemIds: selectedIds, ingredientId, quantity, unit }),
                      t('menuCalc.addedToDishes').replace('{n}', String(selectedIds.length))
                    );
                    if (ok) stopSelecting();
                    return ok;
                  }}
                />
              </>
            )}
          </>
        )
      ) : (
        <IngredientList
          ingredients={ingredients}
          onAdd={() => setAddingIngredient(true)}
          onEdit={setEditingIngredient}
          onSell={(ingredient, priceGross, vatRate) =>
            run(
              () => sellAsBought({ ingredientId: ingredient.id, priceGross, vatRate }),
              t('menuCalc.nowSold').replace('{name}', ingredient.name)
            )
          }
          onStopSelling={(ingredient) =>
            run(
              () => stopSellingAsBought(ingredient.id),
              t('menuCalc.nowIngredient').replace('{name}', ingredient.name)
            )
          }
        />
      )}

      {(addingItem || editingItem) && (
        <DishDialog
          item={editingItem}
          onClose={() => { setAddingItem(false); setEditingItem(null); }}
          onSave={async (input) => {
            await run(() => saveMenuItem({ id: editingItem?.id, ...input }), t('menuCalc.dishSaved'));
            setAddingItem(false);
            setEditingItem(null);
          }}
          onDelete={
            editingItem
              ? async () => {
                  if (!confirm(`${t('menuCalc.confirmRemoveDish')} "${editingItem.name}"?`)) return;
                  await run(() => deleteMenuItem(editingItem.id), t('menuCalc.dishRemoved'));
                  setEditingItem(null);
                }
              : undefined
          }
        />
      )}

      {(addingIngredient || editingIngredient) && (
        <IngredientDialog
          ingredient={editingIngredient}
          initialName={newIngredientName}
          onLinked={load}
          onClose={() => { setAddingIngredient(false); setEditingIngredient(null); setNewIngredientName(''); }}
          onSave={async (input) => {
            await run(
              () => saveIngredient({ id: editingIngredient?.id, ...input }),
              t('menuCalc.ingredientSaved')
            );
            setAddingIngredient(false);
            setEditingIngredient(null);
            setNewIngredientName('');
          }}
          onDelete={
            editingIngredient
              ? async () => {
                  if (await run(() => deleteIngredient(editingIngredient.id))) {
                    toast.success(t('menuCalc.ingredientRemoved'));
                    setEditingIngredient(null);
                  }
                }
              : undefined
          }
        />
      )}

    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function MenuSummary({ items }: { items: MenuItem[] }) {
  const { t } = useLanguage();
  // Costed with or without a recipe: a drink sold as bought has a real cost
  // and no lines, and leaving it out would exclude a quarter of the takings
  // from the averages the owner reads these cards for.
  const costed = items.filter(
    (i) =>
      !i.costing.incomplete &&
      (i.costing.lines.length > 0 || i.costing.purchase !== null)
  );
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
          {t('menuCalc.dishesCosted')}
        </div>
        <div className="text-xl font-bold text-foreground">
          {costed.length}<span className="text-sm text-muted-foreground">/{items.length}</span>
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          {t('menuCalc.avgFoodCost')}<InfoHint term="cogsPct" />
        </div>
        <div className={`text-xl font-bold ${avgFoodCost <= 32 ? 'text-green-400' : avgFoodCost <= 38 ? 'text-amber-400' : 'text-red-400'}`}>
          {formatPercent(avgFoodCost)}
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          {t('menuCalc.estimatedMonthlyMargin')}
        </div>
        <div className="text-xl font-bold text-foreground">
          {withVolume.length > 0 ? formatMoneyExact(monthlyProfit) : '—'}
        </div>
        {withVolume.length === 0 && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{t('menuCalc.enterMonthlySales')}</div>
        )}
      </div>

      <div className="card-glass p-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
          {t('menuCalc.losingMoney')}
        </div>
        <div className={`text-xl font-bold ${losing.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {losing.length}
        </div>
      </div>
    </div>
  );
}

function DishCard({
  item, ingredients, ingredientById, busy, selecting, isSelected,
  onToggle, onEdit, onEditIngredient, onCreateIngredient, onSetLine, onRemoveLine, onAnswer,
}: {
  item: MenuItem;
  ingredients: Ingredient[];
  ingredientById: Map<string, Ingredient>;
  busy: boolean;
  selecting: boolean;
  isSelected: boolean;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onEditIngredient: (ingredient: Ingredient) => void;
  onCreateIngredient: (name: string) => void;
  onSetLine: (ingredientId: string, quantity: number, unit: string) => Promise<boolean>;
  onRemoveLine: (ingredientId: string) => Promise<boolean>;
  /** Settles the made-or-bought question from the row itself. */
  onAnswer: (mode: 'RECIPE' | 'PURCHASE') => void;
}) {
  const { t, language } = useLanguage();
  const c = item.costing;
  const resale = item.costingMode === 'PURCHASE';
  // Costed either way: a bottle has a cost without a recipe, and the figures
  // below mean the same thing for a drink as for a burger.
  const hasRecipe = c.lines.length > 0;
  const costed = resale ? c.purchase?.cost !== null && c.purchase !== null : hasRecipe;
  const suggested = suggestedPrice(c.foodCost, TARGET_FOOD_COST, item.vatRate);
  const used = new Set(c.lines.map((l) => l.ingredientId));
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const purchaseIngredient = item.purchaseItemId
    ? ingredientById.get(item.purchaseItemId)
    : undefined;

  const tone =
    !costed ? 'text-muted-foreground'
      : c.grossProfit <= 0 ? 'text-red-400'
      : (c.foodCostPercent ?? 0) <= 32 ? 'text-green-400'
      : (c.foodCostPercent ?? 0) <= 38 ? 'text-amber-400'
      : 'text-red-400';

  return (
    <article
      className={`card-glass p-4 ${isSelected ? 'ring-2 ring-primary/70 border-primary/40' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        {selecting && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={t('menuCalc.selectDishAria').replace('{name}', item.name)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-foreground truncate">{item.name}</h4>
            {item.menuClass && <MenuClassBadge menuClass={item.menuClass} />}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMoneyExact(item.priceGross)} {t('menuCalc.onTheMenu')} · {t('menuCalc.vat')}{' '}
            {formatPercent(item.vatRate, 0)} · {formatMoneyExact(c.priceNet)} {t('menuCalc.exVat')}
            {item.monthlyVolume ? ` · ~${item.monthlyVolume}${t('menuCalc.perMonthSuffix')}` : ''}
          </div>
        </div>

        {/* Full width under the name on a phone; beside it from there up. */}
        {costed && (
          <div className="order-last basis-full grid grid-cols-3 gap-3 sm:order-none sm:basis-auto sm:gap-6 sm:text-right">
            <Figure label={t('menuCalc.dishCost')} value={formatMoneyExact(c.foodCost)} />
            <Figure
              label={t('menuCalc.grossMargin')}
              value={formatMoneyExact(c.grossProfit)}
              tone={c.grossProfit <= 0 ? 'text-red-400' : 'text-green-400'}
            />
            <Figure
              label={t('menuCalc.foodCost')}
              value={c.foodCostPercent === null ? '—' : formatPercent(c.foodCostPercent)}
              tone={tone}
            />
          </div>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 -m-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          aria-label={`${t('menuCalc.editAria')} ${item.name}`}
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* The question, asked on the row itself.
          The banner above says "open each one and tell us", and the obvious
          thing to press was the purchase-cost box, which opens the bottle --
          the wrong dialog, with no question in it. So the question is put
          here, where it is being asked, and answers in one press. */}
      {item.needsReview && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs text-foreground">{t('menuCalc.reviewAsk')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAnswer('PURCHASE')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                         text-xs font-semibold text-foreground hover:bg-muted transition-colors
                         disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-ring"
            >
              <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
              {t('menuCalc.reviewBought')}
            </button>
            <button
              type="button"
              onClick={() => onAnswer('RECIPE')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                         text-xs font-semibold text-foreground hover:bg-muted transition-colors
                         disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-ring"
            >
              <ChefHat className="w-3.5 h-3.5" aria-hidden="true" />
              {t('menuCalc.reviewMade')}
            </button>
          </div>
        </div>
      )}

      {/* Sold as bought: one cost, no recipe, nothing to add to it. Showing
          an empty ingredient list and an "add ingredient" box here would be
          asking the owner to write a recipe for opening a bottle. */}
      {resale ? (
        <button
          type="button"
          onClick={() => purchaseIngredient && onEditIngredient(purchaseIngredient)}
          disabled={!purchaseIngredient}
          className="mt-3 w-full flex items-center justify-between gap-3 rounded-lg border
                     border-border-subtle px-3 py-2 text-left transition-colors
                     enabled:hover:bg-muted/50 disabled:opacity-60
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
              {t('menuCalc.purchaseCost')}
            </span>
            <span className="block text-xs text-muted-foreground truncate">
              {c.purchase?.source === 'invoice' && item.purchaseInvoiceCostAt
                ? `${t('menuCalc.fromInvoice')} · ${new Date(item.purchaseInvoiceCostAt).toLocaleDateString(locale)}`
                : c.purchase?.source === 'manual'
                  ? t('menuCalc.fixedPrice')
                  : t('menuCalc.noPurchaseCostYet')}
            </span>
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
            {c.purchase?.cost === null || c.purchase === null
              ? '—'
              : `${formatMoneyExact(c.purchase.cost)}/${purchaseIngredient?.unit ?? 'un'}`}
          </span>
        </button>
      ) : hasRecipe ? (
        <ul className="mt-3 rounded-lg border border-border-subtle divide-y divide-border-subtle">
          {c.lines.map((line) => (
            <RecipeLineRow
              // Keyed on the saved values, so a reload resets the field.
              key={`${line.ingredientId}:${line.quantity}:${line.unit}`}
              line={line}
              ingredient={ingredientById.get(line.ingredientId)}
              onEditIngredient={onEditIngredient}
              onSave={(quantity, unit) => onSetLine(line.ingredientId, quantity, unit)}
              onRemove={() => onRemoveLine(line.ingredientId)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t('menuCalc.noRecipeYet')}</p>
      )}

      {!resale && (
        <div className="mt-2">
          <AddLine
            ingredients={ingredients.filter((i) => !used.has(i.id))}
            busy={busy}
            onAdd={(ingredientId, quantity, unit) => onSetLine(ingredientId, quantity, unit)}
            onCreateIngredient={onCreateIngredient}
          />
        </div>
      )}

      {costed && c.incomplete && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
          {c.missingCount}{' '}
          {c.missingCount > 1
            ? t('menuCalc.missingPricesPlural')
            : t('menuCalc.missingPricesSingular')}
        </p>
      )}

      {costed && c.grossProfit <= 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
          {t('menuCalc.dishLoses')}
          {suggested && ` ${t('menuCalc.forTargetItWouldCost')} ${formatMoneyExact(suggested)}.`}
        </p>
      )}

      {costed && c.grossProfit > 0 && (c.foodCostPercent ?? 0) > 38 && suggested && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t('menuCalc.forTargetPriceWouldBe')}{' '}
          <strong className="text-foreground">{formatMoneyExact(suggested)}</strong>.
        </p>
      )}
    </article>
  );
}

/**
 * One ingredient in a dish, edited where it stands: the quantity saves when
 * the field is left or Enter is pressed, the unit as soon as it changes.
 */
function RecipeLineRow({
  line, ingredient, onEditIngredient, onSave, onRemove,
}: {
  line: CostedLine;
  ingredient: Ingredient | undefined;
  onEditIngredient: (ingredient: Ingredient) => void;
  onSave: (quantity: number, unit: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const { t, language } = useLanguage();
  const original = formatQuantity(line.quantity, language);
  const [quantity, setQuantity] = useState(original);

  // Only units that convert from how it is bought — plus the saved one when
  // it does not, so the mistake is visible and can be changed.
  const units: string[] = ingredient ? recipeUnitsFor(ingredient.unit) : [...RECIPE_UNITS];
  if (!units.includes(line.unit)) units.push(line.unit);

  const commit = async () => {
    const value = parseQuantity(quantity);
    if (value === null) { setQuantity(original); return; }
    if (value === line.quantity) return;
    if (!(await onSave(value, line.unit))) setQuantity(original);
  };

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        {ingredient ? (
          <button
            type="button"
            onClick={() => onEditIngredient(ingredient)}
            className="max-w-full truncate text-left text-sm text-foreground hover:text-primary-ink hover:underline"
          >
            {line.name}
          </button>
        ) : (
          <span className="block truncate text-sm text-foreground">{line.name}</span>
        )}
        {line.problem && (
          <span className="block text-[11px] text-warning">
            {line.problem === 'no-price' ? t('menuCalc.noPriceLower') : t('menuCalc.badUnit')}
          </span>
        )}
      </div>

      <input
        type="text"
        inputMode="decimal"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setQuantity(original); e.currentTarget.blur(); }
        }}
        aria-label={t('menuCalc.quantityOf').replace('{name}', line.name)}
        className={`${FIELD} w-20 text-right tabular-nums`}
      />
      <UnitSelect
        units={units}
        value={line.unit}
        invalid={line.problem === 'bad-unit'}
        label={t('menuCalc.unitOf').replace('{name}', line.name)}
        onChange={(unit) => {
          const value = parseQuantity(quantity) ?? line.quantity;
          void onSave(value, unit);
        }}
      />
      <span className="ml-auto sm:ml-0 w-16 text-right text-sm font-semibold tabular-nums text-foreground">
        {line.cost === null ? '—' : formatMoneyExact(line.cost)}
      </span>
      <button
        type="button"
        onClick={() => void onRemove()}
        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-muted"
        aria-label={`${t('menuCalc.removeAria')} ${line.name}`}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

function UnitSelect({
  units, value, label, invalid = false, disabled = false, onChange,
}: {
  units: readonly string[];
  value: string;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (unit: string) => void;
}) {
  // Nothing to choose: say the unit rather than offer a one-item menu.
  if (units.length === 1 && units[0] === value) {
    return (
      <span className="w-16 text-center text-sm text-muted-foreground" aria-label={label}>
        {value}
      </span>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={`${FIELD} w-16 px-2 ${invalid ? '!border-warning text-warning' : ''}`}
    >
      {units.map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
    </select>
  );
}

/** Pick an ingredient by typing, say how much, add. Used per dish and in bulk. */
function AddLine({
  ingredients, busy, onAdd, onCreateIngredient, placement = 'down', submitLabel,
}: {
  ingredients: Ingredient[];
  busy: boolean;
  onAdd: (ingredientId: string, quantity: number, unit: string) => Promise<boolean>;
  onCreateIngredient: (name: string) => void;
  placement?: 'down' | 'up';
  submitLabel?: string;
}) {
  const { t } = useLanguage();
  const [picked, setPicked] = useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('g');
  // Bumped after each add, which gives the picker a clean slate.
  const [round, setRound] = useState(0);
  const pickerRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  const value = parseQuantity(quantity);
  const canAdd = picked !== null && value !== null && !busy;

  const submit = async () => {
    if (!canAdd || !picked || value === null) return;
    if (await onAdd(picked.id, value, unit)) {
      setPicked(null);
      setQuantity('');
      setRound((r) => r + 1);
      // Straight on to the next ingredient: a recipe is entered in a row.
      requestAnimationFrame(() => pickerRef.current?.focus());
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <IngredientPicker
        key={round}
        inputRef={pickerRef}
        ingredients={ingredients}
        picked={picked}
        placement={placement}
        onPick={(ing) => {
          setPicked(ing);
          if (ing) {
            setUnit(recipeUnitsFor(ing.unit)[0]);
            requestAnimationFrame(() => quantityRef.current?.focus());
          }
        }}
        onCreate={onCreateIngredient}
      />
      <div className="flex items-center gap-2">
        <input
          ref={quantityRef}
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder={picked?.unit === 'un' ? '1' : '150'}
          aria-label={t('menuCalc.quantity')}
          className={`${FIELD} w-20 text-right tabular-nums`}
        />
        <UnitSelect
          units={picked ? recipeUnitsFor(picked.unit) : RECIPE_UNITS}
          value={unit}
          disabled={!picked}
          label={t('menuCalc.unit')}
          onChange={setUnit}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canAdd}
          className="cta-button !h-10 sm:!h-9 !py-0 !px-3 !text-xs shrink-0 disabled:opacity-40"
          aria-label={submitLabel ? undefined : t('menuCalc.addToDish')}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * A search box over the ingredients, in place of a select that has to be
 * scrolled through. Arrow keys and Enter work; an unknown name offers to
 * create it.
 */
function IngredientPicker({
  ingredients, picked, onPick, onCreate, placement, inputRef,
}: {
  ingredients: Ingredient[];
  picked: Ingredient | null;
  onPick: (ingredient: Ingredient | null) => void;
  onCreate: (name: string) => void;
  placement: 'down' | 'up';
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const [text, setText] = useState(picked?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Only a real pick rewrites the text; clearing it is the typing itself.
  useEffect(() => { if (picked) setText(picked.name); }, [picked]);

  const q = searchKey(text);
  const matches = useMemo(() => {
    if (picked) return [];
    const hits = q === '' ? ingredients : ingredients.filter((i) => searchKey(i.name).includes(q));
    // Names that start with what was typed first; otherwise keep A–Z.
    return [...hits]
      .sort((a, b) => Number(searchKey(b.name).startsWith(q)) - Number(searchKey(a.name).startsWith(q)))
      .slice(0, 50);
  }, [ingredients, q, picked]);

  const exists = ingredients.some((i) => searchKey(i.name) === q);
  const canCreate = !picked && text.trim() !== '' && !exists;
  const optionCount = matches.length + (canCreate ? 1 : 0);
  const showList = open && !picked && (optionCount > 0 || text.trim() !== '');

  useEffect(() => {
    if (!showList) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, showList, listId]);

  const choose = (index: number) => {
    if (index < matches.length) onPick(matches[index]);
    else if (canCreate) onCreate(text.trim());
    setOpen(false);
  };

  return (
    <div className="relative flex-1 min-w-[11rem]">
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && optionCount > 0 ? `${listId}-${active}` : undefined}
        aria-label={t('menuCalc.addIngredient')}
        placeholder={t('menuCalc.searchIngredient')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          if (picked) onPick(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(optionCount - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && showList && optionCount > 0) {
            e.preventDefault();
            choose(active);
          } else if (e.key === 'Escape' && showList) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={`${FIELD} w-full pl-8 ${picked ? 'font-medium' : ''}`}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute z-30 left-0 right-0 max-h-60 overflow-y-auto overscroll-contain
                      rounded-lg border border-border bg-card shadow-lg py-1 ${
                        placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
        >
          {matches.map((ing, i) => {
            const cost = unitCostOf(ing);
            return (
              <li
                key={ing.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer ${
                  i === active ? 'bg-muted text-foreground' : 'text-foreground'
                }`}
              >
                <span className="truncate">{ing.name}</span>
                <span className={`shrink-0 text-[11px] tabular-nums ${cost === null ? 'text-warning' : 'text-muted-foreground'}`}>
                  {cost === null ? t('menuCalc.noPriceLower') : `${formatMoneyExact(cost)}/${ing.unit}`}
                </span>
              </li>
            );
          })}
          {canCreate && (
            <li
              id={`${listId}-${matches.length}`}
              role="option"
              aria-selected={active === matches.length}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => choose(matches.length)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary-ink cursor-pointer ${
                active === matches.length ? 'bg-muted' : ''
              } ${matches.length > 0 ? 'border-t border-border-subtle' : ''}`}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('menuCalc.createNamed').replace('{name}', text.trim())}
            </li>
          )}
          {optionCount === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t('menuCalc.noIngredientMatch')}</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Appears once dishes are ticked: one ingredient, added to all of them. */
function BulkBar({
  count, ingredients, busy, onAdd, onCreateIngredient, onCancel,
}: {
  count: number;
  ingredients: Ingredient[];
  busy: boolean;
  onAdd: (ingredientId: string, quantity: number, unit: string) => Promise<boolean>;
  onCreateIngredient: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const label =
    count === 1 ? t('menuCalc.selectedOne') : t('menuCalc.selectedMany').replace('{n}', String(count));

  return (
    <div
      role="region"
      aria-label={label}
      className="fixed z-40 inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))]
                 md:bottom-6 md:left-1/2 md:right-auto md:w-[min(46rem,calc(100vw-3rem))] md:-translate-x-1/2
                 rounded-2xl border border-primary/40 bg-card shadow-modal p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-foreground" aria-live="polite">{label}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {t('menuCalc.cancel')}
        </button>
      </div>
      <AddLine
        ingredients={ingredients}
        busy={busy}
        placement="up"
        submitLabel={t('menuCalc.addToSelected')}
        onAdd={onAdd}
        onCreateIngredient={onCreateIngredient}
      />
      <p className="mt-2 text-[11px] text-muted-foreground">{t('menuCalc.bulkHint')}</p>
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
  const { t } = useLanguage();
  const styles: Record<MenuClass, string> = {
    star: 'bg-success/15 text-green-400',
    plowhorse: 'bg-info/15 text-info',
    puzzle: 'bg-warning/15 text-amber-400',
    dog: 'bg-danger/15 text-red-400',
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${styles[menuClass]}`}
      title={t(`menuCalc.class.${menuClass}.advice`)}
    >
      {t(`menuCalc.class.${menuClass}.label`)}
    </span>
  );
}

function EmptyMenu({
  hasIngredients, onAdd, onIngredients, onImported,
}: {
  hasIngredients: boolean;
  onAdd: () => void;
  onIngredients: () => void;
  onImported: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="card-glass p-8 text-center">
      <ChefHat className="w-8 h-8 mx-auto text-muted-foreground/40" aria-hidden="true" />
      <h4 className="mt-3 font-semibold text-foreground">{t('menuCalc.emptyTitle')}</h4>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
        {t('menuCalc.emptyBody')}
      </p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        {/* Before "add a dish", because a menu already in the till is
            two hundred dishes nobody wants to type twice. */}
        <CatalogueImport onImported={onImported} />
        <button type="button" onClick={onAdd} className="cta-button !py-2 !px-4 !text-sm">
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t('menuCalc.addDish')}
        </button>
        {!hasIngredients && (
          <button type="button" onClick={onIngredients} className="cta-button-secondary !py-2 !px-4 !text-sm">
            <Carrot className="w-4 h-4" aria-hidden="true" />
            {t('menuCalc.startWithIngredients')}
          </button>
        )}
      </div>
    </div>
  );
}

function IngredientList({
  ingredients, onAdd, onEdit, onSell, onStopSelling,
}: {
  ingredients: Ingredient[];
  onAdd: () => void;
  onEdit: (i: Ingredient) => void;
  onSell: (ingredient: Ingredient, priceGross: number, vatRate: number) => Promise<boolean>;
  onStopSelling: (ingredient: Ingredient) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  // Two kinds of bought thing, side by side rather than one hidden behind the
  // other.
  //
  // An ingredient is bought by weight and goes *into* something: lettuce,
  // bacon, buns. A unit is bought by the bottle or the pack and sold as it
  // stands: a Super Bock, a coffee. Both are things the restaurant buys and
  // both carry a price from the invoices, so they belong on one page -- but
  // they are not the same kind of thing, and a single list of ninety rows
  // said they were.
  const shown = ingredients.filter((ing) => matchesSearch(search, ing.name));
  const asIngredients = shown.filter((ing) => ing.soldAsId === null);
  const asUnits = shown.filter((ing) => ing.soldAsId !== null);

  // What is being dragged, and which column is under it. Held here rather
  // than in each column so the two can light up as a pair -- the one you
  // left and the one you are over.
  const [dragging, setDragging] = useState<Ingredient | null>(null);
  const [over, setOver] = useState<'ingredients' | 'units' | null>(null);
  // The price a bought thing will be sold at, asked for on the drop.
  const [pricing, setPricing] = useState<Ingredient | null>(null);

  const drop = async (column: 'ingredients' | 'units') => {
    const item = dragging;
    setDragging(null);
    setOver(null);
    if (!item) return;

    // Dropped back where it came from: nothing to do, and no dialog.
    const wasUnit = item.soldAsId !== null;
    if (wasUnit === (column === 'units')) return;

    if (column === 'units') {
      // Needs a selling price, which nothing in the data knows.
      setPricing(item);
      return;
    }

    // The losing direction, so it is said out loud first.
    if (!confirm(t('menuCalc.confirmStopSelling').replace('{name}', item.name))) return;
    await onStopSelling(item);
  };

  return (
    <div className="card-glass p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="font-semibold text-foreground">{t('menuCalc.tabProducts')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('menuCalc.productsHint')}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="cta-button !py-2 !px-3 !text-xs shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t('menuCalc.new')}
        </button>
      </div>

      <ListSearch
        value={search}
        onChange={setSearch}
        placeholder={t('menuCalc.searchIngredients')}
        count={ingredients.length}
        matches={shown.length}
      />

      {ingredients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('menuCalc.noIngredients')}
        </p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('menuCalc.noIngredientMatches')}
        </p>
      ) : (
        /* Side by side on a desktop, stacked on a phone. Two columns because
           they answer different questions -- "what does my beef cost a kilo"
           against "what did that bottle cost me" -- and one list of ninety
           rows made the owner read every name to work out which kind he had. */
        <div className="grid lg:grid-cols-2 gap-x-6 gap-y-5">
          <ProductGroup
            icon={<Carrot className="w-4 h-4 text-success" aria-hidden="true" />}
            title={t('menuCalc.groupIngredients')}
            hint={t('menuCalc.groupIngredientsHint')}
            rows={asIngredients}
            onEdit={onEdit}
            dragging={dragging}
            isOver={over === 'ingredients'}
            accepts={dragging !== null && dragging.soldAsId !== null}
            onDragStart={setDragging}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={() => setOver('ingredients')}
            onDragLeave={() => setOver((c) => (c === 'ingredients' ? null : c))}
            onDrop={() => drop('ingredients')}
            onMove={(ing) => onStopSelling(ing)}
            moveLabel={t('menuCalc.moveToIngredients')}
          />
          <ProductGroup
            icon={<ShoppingBag className="w-4 h-4 text-primary" aria-hidden="true" />}
            title={t('menuCalc.groupUnits')}
            hint={t('menuCalc.groupUnitsHint')}
            rows={asUnits}
            onEdit={onEdit}
            dragging={dragging}
            isOver={over === 'units'}
            accepts={dragging !== null && dragging.soldAsId === null}
            onDragStart={setDragging}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={() => setOver('units')}
            onDragLeave={() => setOver((c) => (c === 'units' ? null : c))}
            onDrop={() => drop('units')}
            onMove={(ing) => { setPricing(ing); return Promise.resolve(true); }}
            moveLabel={t('menuCalc.moveToUnits')}
          />
        </div>
      )}

      {pricing && (
        <SellAsBoughtDialog
          ingredient={pricing}
          onClose={() => setPricing(null)}
          onSave={async (priceGross, vatRate) => {
            const ok = await onSell(pricing, priceGross, vatRate);
            if (ok) setPricing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * What to charge for something the restaurant has only ever bought.
 *
 * Asked on the drop rather than guessed, because nothing in the data knows
 * it: the till records what was sold, and this is a thing that was not. A
 * product created at zero would sit on the Ementa reporting a margin of minus
 * its own cost until somebody happened to look.
 */
function SellAsBoughtDialog({
  ingredient, onClose, onSave,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onSave: (priceGross: number, vatRate: number) => void;
}) {
  const { t } = useLanguage();
  const [price, setPrice] = useState('');
  const [vatRate, setVatRate] = useState(13);

  const priceValue = Number(price.replace(',', '.'));
  const valid = Number.isFinite(priceValue) && priceValue > 0;

  return (
    <Dialog onClose={onClose} title={t('menuCalc.sellAsBoughtTitle')}>
      <p className="text-sm text-foreground font-medium">{ingredient.name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {t('menuCalc.sellAsBoughtBody')}
      </p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            {t('menuCalc.menuPrice')}
            <span className="block text-[10px] opacity-70">{t('menuCalc.incVat')}</span>
          </span>
          <input
            type="text" inputMode="decimal" value={price} autoFocus
            onChange={(e) => setPrice(e.target.value)}
            placeholder="1,80" className="input-field !py-2"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            {t('menuCalc.vat')}
            <span className="block text-[10px] opacity-70">{t('menuCalc.vatHint')}</span>
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

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => valid && onSave(priceValue, vatRate)}
          disabled={!valid}
          className="cta-button !py-2 !px-4 !text-sm disabled:opacity-50"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          {t('menuCalc.sellAsBoughtConfirm')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="cta-button-secondary !py-2 !px-4 !text-sm"
        >
          {t('menuCalc.cancel')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * One column of bought things, with a heading saying what kind they are.
 *
 * Shared by both columns so the two can never drift into looking like
 * different features. The icon carries the distinction at a glance -- a
 * carrot for what goes into something, a bag for what is sold as it stands --
 * and the count sits on the heading because "have I got any of these at all"
 * is the first question an empty-looking column raises.
 */
function ProductGroup({
  icon, title, hint, rows, onEdit,
  dragging, isOver, accepts, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  onMove, moveLabel,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  rows: Ingredient[];
  onEdit: (i: Ingredient) => void;
  /** The row being dragged anywhere on the page, or null. */
  dragging: Ingredient | null;
  isOver: boolean;
  /** Whether what is being dragged could land here. */
  accepts: boolean;
  onDragStart: (i: Ingredient) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  /** The same move as the drop, for anyone not using a mouse. */
  onMove: (i: Ingredient) => Promise<boolean>;
  moveLabel: string;
}) {
  const { t, language } = useLanguage();

  return (
    <section
      onDragOver={(e) => {
        // Without this the browser refuses the drop outright.
        if (!accepts) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (!accepts) return;
        e.preventDefault();
        onDrop();
      }}
      className={`rounded-xl transition-colors ${
        isOver && accepts
          ? 'bg-primary/5 outline-dashed outline-2 outline-offset-4 outline-primary/50'
          : accepts
            ? 'outline-dashed outline-2 outline-offset-4 outline-border-subtle'
            : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">
          {title}
        </h5>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">{hint}</p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground
                      border border-dashed border-border-subtle rounded-xl">
          {t('menuCalc.groupEmpty')}
        </p>
      ) : (
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {rows.map((ing) => {
            const fromInvoice = ing.manualUnitCost === null && ing.invoiceUnitCost !== null;
            const cost = ing.manualUnitCost ?? ing.invoiceUnitCost;
            return (
              <div
                key={ing.id}
                draggable
                onDragStart={(e) => {
                  // Firefox will not start a drag without data set.
                  e.dataTransfer.setData('text/plain', ing.id);
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart(ing);
                }}
                onDragEnd={onDragEnd}
                className={`min-h-[56px] px-1 py-3 flex items-center gap-2 group ${
                  dragging?.id === ing.id ? 'opacity-40' : ''
                } hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing`}
              >
              <button
                type="button"
                onClick={() => onEdit(ing)}
                className="min-w-0 flex-1 flex items-center gap-3 text-left py-1
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">{ing.name}</span>
                  <span className="block text-[11px] text-muted-foreground flex items-center gap-1">
                    {cost === null ? (
                      <span className="text-warning">{t('menuCalc.noPrice')}</span>
                    ) : (
                      <>
                        {fromInvoice ? (
                          <Receipt className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Tag className="w-3 h-3" aria-hidden="true" />
                        )}
                        {fromInvoice ? t('menuCalc.fromInvoice') : t('menuCalc.fixedPrice')}
                        {/* When, not just where from. A price with no date
                            could be from last week or from last year, and
                            an owner costing a dish needs to know which. */}
                        {fromInvoice && ing.invoiceCostAt && (
                          <span className="opacity-70">
                            {' · '}{new Date(ing.invoiceCostAt).toLocaleDateString(language === 'pt' ? 'pt-PT' : 'en-GB')}
                          </span>
                        )}
                        {ing.wastePercent > 0 &&
                          ` · ${formatPercent(ing.wastePercent, 0)} ${t('menuCalc.wasteSuffix')}`}
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                  {cost === null ? '—' : `${formatMoneyExact(cost)}/${ing.unit}`}
                </span>
              </button>

              {/* The same move the drag does, for a keyboard, a screen
                  reader, or a phone where dragging between two stacked
                  columns is a poor gesture. Shown on hover and whenever it
                  has focus, so it is never only discoverable by mouse. */}
              <button
                type="button"
                onClick={() => onMove(ing)}
                aria-label={`${moveLabel}: ${ing.name}`}
                title={moveLabel}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground opacity-0
                           group-hover:opacity-100 focus:opacity-100 hover:text-foreground
                           hover:bg-muted transition-all focus-visible:outline-none
                           focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
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
    costingMode?: 'RECIPE' | 'PURCHASE';
  }) => void;
  onDelete?: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [price, setPrice] = useState(item ? String(item.priceGross) : '');
  const [vatRate, setVatRate] = useState(item?.vatRate ?? 13);
  const [volume, setVolume] = useState(item?.monthlyVolume ? String(item.monthlyVolume) : '');
  const [mode, setMode] = useState<'RECIPE' | 'PURCHASE'>(item?.costingMode ?? 'RECIPE');

  const priceValue = Number(price.replace(',', '.'));
  const valid = name.trim().length > 0 && Number.isFinite(priceValue) && priceValue >= 0;

  return (
    <Dialog onClose={onClose} title={item ? t('menuCalc.editDish') : t('menuCalc.newDish')}>
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('menuCalc.name')}</span>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          maxLength={80} autoFocus placeholder={t('menuCalc.dishNamePlaceholder')}
          className="input-field !py-2"
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('menuCalc.section')}</span>
        <input
          type="text" value={category} onChange={(e) => setCategory(e.target.value)}
          maxLength={40} placeholder={t('menuCalc.sectionPlaceholder')}
          className="input-field !py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            {t('menuCalc.menuPrice')}
            <span className="block text-[10px] opacity-70">{t('menuCalc.incVat')}</span>
          </span>
          <input
            type="text" inputMode="decimal" value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="12,50" className="input-field !py-2"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">
            {t('menuCalc.vat')}
            <span className="block text-[10px] opacity-70">{t('menuCalc.vatHint')}</span>
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
          {t('menuCalc.monthlyVolume')}
          <span className="block text-[10px] opacity-70">
            {t('menuCalc.monthlyVolumeHint')}
          </span>
        </span>
        <input
          type="number" min={0} value={volume}
          onChange={(e) => setVolume(e.target.value)}
          placeholder={t('menuCalc.volumePlaceholder')} className="input-field !py-2 w-32"
        />
      </label>

      {/* The one thing the till cannot tell us.
          A milkshake is made and a beer is opened, and nothing in the sales
          data says which -- so it is asked here rather than guessed, because
          a wrong answer is a margin that looks right and is not. */}
      <fieldset className="mt-4">
        <legend className="text-xs text-muted-foreground mb-1.5">
          {t('menuCalc.howCosted')}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'RECIPE' as const, icon: ChefHat, label: t('menuCalc.modeRecipe'), hint: t('menuCalc.modeRecipeHint') },
            { value: 'PURCHASE' as const, icon: ShoppingBag, label: t('menuCalc.modePurchase'), hint: t('menuCalc.modePurchaseHint') },
          ]).map((option) => {
            const Icon = option.icon;
            const on = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={on}
                className={`rounded-xl border p-3 text-left transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    on
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border-subtle hover:bg-muted/50'
                  }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {option.label}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-1">
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
        {/* Said once, where the consequence is: the lines stay on the row and
            stop counting, rather than being deleted behind the owner's back. */}
        {item && item.costingMode === 'RECIPE' && mode === 'PURCHASE'
          && item.costing.lines.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
            {t('menuCalc.modeRecipeLinesIgnored')}
          </p>
        )}
      </fieldset>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() =>
            valid && onSave({
              costingMode: mode,
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
          {t('menuCalc.save')}
        </button>
        {onDelete && (
          <button
            type="button" onClick={onDelete}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label={t('menuCalc.removeDish')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </Dialog>
  );
}

function IngredientDialog({
  ingredient, initialName = '', onClose, onSave, onDelete, onLinked,
}: {
  ingredient: Ingredient | null;
  /** Typed into the recipe's search before deciding to create it. */
  initialName?: string;
  onClose: () => void;
  /** A link changed, so the price behind this dialog has moved. */
  onLinked?: () => void;
  onSave: (input: {
    name: string; unit: string; manualUnitCost: number | null; wastePercent: number;
  }) => void;
  onDelete?: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(ingredient?.name ?? initialName);
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
    <Dialog
      onClose={onClose}
      title={ingredient ? t('menuCalc.editIngredient') : t('menuCalc.newIngredient')}
    >
      <label className="block">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('menuCalc.name')}</span>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          maxLength={60} autoFocus placeholder={t('menuCalc.ingredientNamePlaceholder')}
          className="input-field !py-2"
        />
        <span className="block text-[10px] text-muted-foreground mt-1">
          {t('menuCalc.ingredientNameHint')}
        </span>
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">{t('menuCalc.howBought')}</span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input-field !py-2 w-32">
          {PURCHASE_UNITS.map((u) => (
            <option key={u} value={u}>{t('menuCalc.per')} {u}</option>
          ))}
        </select>
      </label>

      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <span className="text-xs text-muted-foreground block mb-2">{t('menuCalc.price')}</span>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="radio" checked={useInvoice} onChange={() => setUseInvoice(true)}
            className="mt-0.5" name="costSource"
          />
          <span className="min-w-0">
            <span className="block text-sm text-foreground">{t('menuCalc.useInvoicePrice')}</span>
            <span className="block text-[11px] text-muted-foreground">
              {ingredient?.invoiceUnitCost != null
                ? `${t('menuCalc.currently')} ${formatMoneyExact(ingredient.invoiceUnitCost)}/${ingredient.unit}. ${t('menuCalc.updatesItself')}`
                : t('menuCalc.noInvoiceYet')}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer mt-3">
          <input
            type="radio" checked={!useInvoice} onChange={() => setUseInvoice(false)}
            className="mt-0.5" name="costSource"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-foreground">{t('menuCalc.typeThePrice')}</span>
            <span className="block text-[11px] text-muted-foreground mb-2">
              {t('menuCalc.typeThePriceHint')}
            </span>
            {!useInvoice && (
              <span className="flex items-center gap-2">
                <input
                  type="text" inputMode="decimal" value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="12,50" className="input-field !py-1.5 !text-sm w-28"
                />
                <span className="text-xs text-muted-foreground">€ {t('menuCalc.per')} {unit}</span>
              </span>
            )}
          </span>
        </label>
      </div>

      <label className="block mt-3">
        <span className="text-xs text-muted-foreground block mb-1.5">
          {t('menuCalc.waste')}
          <span className="block text-[10px] opacity-70">
            {t('menuCalc.wasteHint')}
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
          {t('menuCalc.save')}
        </button>
        {onDelete && (
          <button
            type="button" onClick={onDelete}
            className="cta-button-secondary !py-2.5 !px-3 !text-sm text-danger"
            aria-label={t('menuCalc.removeIngredient')}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Only for an ingredient that exists: there is no history behind
          one being created. */}
      {ingredient && (
        <>
          {/* Above the history, because an ingredient with no price has
              nothing to show below and this is how it gets one. */}
          <IngredientSources
            ingredientId={ingredient.id}
            ingredientName={ingredient.name}
            onChanged={onLinked}
          />
          <IngredientPriceHistory
            ingredientId={ingredient.id}
            unit={ingredient.unit}
          />
        </>
      )}
    </Dialog>
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
  const { t } = useLanguage();
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
                   p-5 shadow-modal max-h-[90dvh] overflow-y-auto overscroll-contain
                   pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h4 className="font-bold text-foreground">{title}</h4>
          <button
            type="button" onClick={onClose}
            className="p-1 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label={t('menuCalc.close')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
