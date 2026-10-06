'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, ChefHat, Carrot, RotateCcw } from 'lucide-react';
import { getMenuGraph } from '../catalogue-actions';
import { useChartTheme } from '@/lib/chart-theme';
import { useLanguage } from '@/lib/language-context';
import {
  buildGraph, seedPositions, step, nodeAt, SETTLED,
  type GraphNode, type GraphEdge,
} from '@/lib/force-graph';

/**
 * The menu as a map.
 *
 * A dish is a circle, an ingredient is a circle, and a line between them says
 * one goes in the other. That is the whole vocabulary — and what it buys is
 * the thing a table cannot show: ingredients shared between dishes pull those
 * dishes together, so when half the menu hangs off one bun, the drawing says
 * so before anyone works it out.
 *
 * It is also a picture of what is missing. A dish with no recipe cannot be
 * costed and has nothing to hold it, so it drifts to the edge, dim and alone.
 * Seventy of those around a lit cluster of three says where the work is more
 * plainly than a progress bar would.
 *
 * Drawn on a canvas rather than as SVG: a few hundred nodes moved sixty times
 * a second is a few hundred DOM mutations a frame, and the browser gives that
 * up long before the physics does.
 *
 * **Desktop only**, and not for the reason it sounds like. A frame costs
 * 0.3ms for a real menu and 0.57ms for one twice the size — about 2% of the
 * 60fps budget, which any phone of the last decade manages without noticing.
 * What a phone cannot do is the interaction: these are seven-pixel circles
 * packed into 390 points of width, and dragging one with a thumb means
 * catching four of its neighbours first. Below the lg breakpoint the same
 * facts are given as a sentence, which is the honest version of them on that
 * screen rather than a worse version of this one.
 */

interface Dish {
  id: string;
  name: string;
  category: string | null;
  monthlyVolume: number | null;
  priceGross: number;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  priced: boolean;
}

interface Line {
  menuItemId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
}

/**
 * The most frames one layout may take.
 *
 * Measured rather than guessed: a real menu settles in about 350 and a
 * frame costs 0.3ms, so this is roughly ten seconds of headroom nobody
 * will reach. It exists for the graph that would never settle at all.
 */
const MAX_FRAMES = 600;

export default function MenuGraph() {
  const { t } = useLanguage();
  const chart = useChartTheme();

  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<number>(0);
  // Frames spent on the current layout. A frame is cheap — 0.3ms for a
  // real menu, 2% of the 60fps budget — but a graph that never quite
  // settles would spin forever, and on a laptop that is a warm fan and a
  // flat battery for a picture that stopped changing long ago.
  const spent = useRef(0);

  // The simulation lives in refs: it changes sixty times a second, and
  // putting it in state would re-render the tree just as often.
  const nodes = useRef<GraphNode[]>([]);
  const edges = useRef<GraphEdge[]>([]);
  const size = useRef({ width: 0, height: 0 });
  const dragging = useRef<GraphNode | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const hovered = useRef<GraphNode | null>(null);

  // Matches the lg breakpoint. Below it the canvas is not drawn at all,
  // so the simulation never starts rather than running behind a hidden
  // element and burning a phone battery on a picture nobody sees.
  const [roomy, setRoomy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ dishes: 0, ingredients: 0, links: 0, orphans: 0 });
  const [selected, setSelected] = useState<{ node: GraphNode; detail: string } | null>(null);
  const detail = useRef(new Map<string, string>());

  /** How big a circle is drawn, from how much it carries. */
  const radiusOf = useCallback((node: GraphNode) => {
    const base = node.kind === 'dish' ? 7 : 6;
    // Square root, or one bestseller becomes a planet and the rest specks.
    return base + Math.sqrt(Math.max(0, node.weight)) * (node.kind === 'dish' ? 0.55 : 2.2);
  }, []);

  const colourOf = useCallback(
    (node: GraphNode) => {
      if (node.kind === 'dish') return chart.data.revenue;
      return chart.data.costs;
    },
    [chart],
  );

  const draw = useCallback(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;

    const { width, height } = size.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const byId = new Map(nodes.current.map((n) => [n.id, n]));
    const active = dragging.current ?? hovered.current;
    // What the active node touches, so everything else can recede.
    const near = new Set<string>();
    if (active) {
      near.add(active.id);
      for (const e of edges.current) {
        if (e.source === active.id) near.add(e.target);
        if (e.target === active.id) near.add(e.source);
      }
    }

    // Links first, under the circles.
    ctx.lineWidth = 1;
    for (const edge of edges.current) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;

      const lit = !active || (near.has(a.id) && near.has(b.id));
      ctx.strokeStyle = chart.grid;
      ctx.globalAlpha = lit ? 0.85 : 0.12;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    for (const node of nodes.current) {
      const r = radiusOf(node);
      const dim = active ? !near.has(node.id) : false;
      // An orphan is drawn hollow: present, countable, visibly not yet
      // attached to anything.
      const colour = colourOf(node);

      ctx.globalAlpha = dim ? 0.18 : node.orphan ? 0.55 : 1;

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      if (node.orphan) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = colour;
        ctx.fill();
      }

      // Labels only where they can be read: every name at once is a grey
      // smear, so the big nodes and whatever is under the finger get one.
      const named = !dim && (r > 11 || node === active);
      if (named) {
        ctx.globalAlpha = dim ? 0.3 : 0.92;
        ctx.fillStyle = chart.tooltipText;
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
        ctx.fillText(label, node.x, node.y + r + 4);
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }, [chart, colourOf, radiusOf]);

  /** Runs physics until it settles, then stops. */
  const animate = useCallback(() => {
    const { width, height } = size.current;
    const movement = step(nodes.current, edges.current, width, height);
    spent.current += 1;
    draw();

    // Keeps going while a finger is down, since dragging feeds energy
    // in — but never past the ceiling, which a very large graph can
    // otherwise run against indefinitely without ever coming to rest.
    if (spent.current < MAX_FRAMES && (movement > SETTLED || dragging.current)) {
      frame.current = requestAnimationFrame(animate);
    } else {
      frame.current = 0;
    }
  }, [draw]);

  const kick = useCallback(() => {
    spent.current = 0;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(animate);
  }, [animate]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setRoomy(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Size the canvas to its box, at device resolution.
  useEffect(() => {
    if (!roomy) return;
    const box = wrapper.current;
    const el = canvas.current;
    if (!box || !el) return;

    const resize = () => {
      const rect = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { width: rect.width, height: rect.height };
      el.width = Math.max(1, Math.round(rect.width * dpr));
      el.height = Math.max(1, Math.round(rect.height * dpr));
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      kick();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => observer.disconnect();
  }, [kick, roomy]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getMenuGraph();
    setLoading(false);
    if (!('data' in result) || !result.data) return;

    const { dishes, ingredients, lines } = result.data as {
      dishes: Dish[]; ingredients: Ingredient[]; lines: Line[];
    };

    const graph = buildGraph({ dishes, ingredients, lines });
    nodes.current = graph.nodes;
    edges.current = graph.edges;

    // What each circle says when tapped, worked out once rather than on
    // every frame.
    const map = new Map<string, string>();
    const usedBy = new Map<string, string[]>();
    const dishName = new Map(dishes.map((d) => [d.id, d.name]));
    for (const line of lines) {
      const list = usedBy.get(line.ingredientId) ?? [];
      list.push(dishName.get(line.menuItemId) ?? '');
      usedBy.set(line.ingredientId, list);
    }
    for (const d of dishes) {
      const count = lines.filter((l) => l.menuItemId === d.id).length;
      map.set(
        `dish:${d.id}`,
        count === 0
          ? t('menuGraph.dishNoRecipe')
          : t('menuGraph.dishLines').replace('{n}', String(count)),
      );
    }
    for (const i of ingredients) {
      const uses = usedBy.get(i.id)?.length ?? 0;
      map.set(
        `ing:${i.id}`,
        uses === 0
          ? t('menuGraph.ingredientUnused')
          : t('menuGraph.ingredientUsedIn').replace('{n}', String(uses)),
      );
    }
    detail.current = map;

    setCounts({
      dishes: dishes.length,
      ingredients: ingredients.length,
      links: lines.length,
      orphans: graph.nodes.filter((n) => n.orphan).length,
    });

    const { width, height } = size.current;
    seedPositions(nodes.current, width || 800, height || 500);
    kick();
  }, [kick, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const pointAt = (event: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const { x, y } = pointAt(event);
    const hit = nodeAt(nodes.current, x, y, radiusOf);
    pointer.current = { x, y };

    if (hit) {
      hit.fixed = true;
      dragging.current = hit;
      canvas.current?.setPointerCapture(event.pointerId);
      setSelected({ node: hit, detail: detail.current.get(hit.id) ?? '' });
    } else {
      setSelected(null);
    }
    kick();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const { x, y } = pointAt(event);
    const held = dragging.current;

    if (held) {
      held.x = x;
      held.y = y;
      return;
    }

    // Hover dims everything the node does not touch, which is what makes a
    // dense middle readable.
    const hit = nodeAt(nodes.current, x, y, radiusOf);
    if (hit !== hovered.current) {
      hovered.current = hit;
      if (canvas.current) canvas.current.style.cursor = hit ? 'pointer' : 'default';
      draw();
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    const held = dragging.current;
    if (held) {
      // Released, not pinned: the layout should close around it again.
      held.fixed = false;
      dragging.current = null;
      canvas.current?.releasePointerCapture(event.pointerId);
      kick();
    }
  };

  const replay = () => {
    const { width, height } = size.current;
    seedPositions(nodes.current, width, height);
    setSelected(null);
    kick();
  };

  const empty = !loading && counts.dishes === 0 && counts.ingredients === 0;

  return (
    <div className="card-glass p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground mb-1">{t('menuGraph.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('menuGraph.subtitle')}</p>
        </div>
        {!empty && roomy && (
          <button
            type="button"
            onClick={replay}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       text-muted-foreground hover:text-foreground hover:bg-muted transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {t('menuGraph.rearrange')}
          </button>
        )}
      </div>

      {!empty && (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 mb-3">
          <Key colour={chart.data.revenue} label={t('menuGraph.keyDishes')} value={counts.dishes} />
          <Key colour={chart.data.costs} label={t('menuGraph.keyIngredients')} value={counts.ingredients} />
          <Key colour={chart.data.revenue} hollow label={t('menuGraph.keyUnlinked')} value={counts.orphans} />
        </ul>
      )}

      {/* On a phone the map is replaced, not shrunk: seven-pixel circles and
          a thumb do not meet, and a version of this that cannot be dragged
          is a picture of a graph rather than a graph. */}
      {!roomy && !empty && !loading && (
        <div className="rounded-xl bg-surface border border-border-subtle p-5">
          <p className="text-sm text-foreground">
            {t('menuGraph.summary')
              .replace('{dishes}', String(counts.dishes))
              .replace('{ingredients}', String(counts.ingredients))
              .replace('{links}', String(counts.links))
              .replace('{orphans}', String(counts.orphans))}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t('menuGraph.desktopOnly')}</p>
        </div>
      )}

      {(loading || empty) && (
        <div className="h-[220px] lg:h-[460px] rounded-xl bg-surface border border-border-subtle
                        flex flex-col items-center justify-center text-center px-6">
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
          ) : (
            <>
              <ChefHat className="w-8 h-8 text-muted-foreground/40 mb-3" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">{t('menuGraph.emptyTitle')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">{t('menuGraph.emptyBody')}</p>
            </>
          )}
        </div>
      )}

      <div
        ref={wrapper}
        className={`relative h-[460px] rounded-xl bg-surface border border-border-subtle overflow-hidden ${
          roomy && !loading && !empty ? '' : 'hidden'
        }`}
      >
        <canvas
          ref={canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => { hovered.current = null; draw(); }}
          className="touch-none"
          // The drawing is decorative; the figures below carry the meaning.
          aria-hidden="true"
        />

        {selected && (
          <div className="absolute left-3 bottom-3 right-3 sm:right-auto sm:max-w-xs
                          rounded-xl bg-card border border-border shadow-modal px-3.5 py-3">
            <div className="flex items-center gap-2 mb-1">
              {selected.node.kind === 'dish'
                ? <ChefHat className="w-3.5 h-3.5 shrink-0" style={{ color: chart.data.revenue }} aria-hidden="true" />
                : <Carrot className="w-3.5 h-3.5 shrink-0" style={{ color: chart.data.costs }} aria-hidden="true" />}
              <span className="text-sm font-semibold text-foreground truncate">{selected.node.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{selected.detail}</p>
          </div>
        )}
      </div>

      {/* The canvas is hidden from assistive technology, so the same facts
          are here as text rather than locked inside a picture. */}
      {!empty && !loading && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('menuGraph.summary')
            .replace('{dishes}', String(counts.dishes))
            .replace('{ingredients}', String(counts.ingredients))
            .replace('{links}', String(counts.links))
            .replace('{orphans}', String(counts.orphans))}
        </p>
      )}
    </div>
  );
}

function Key({ colour, label, value, hollow = false }: {
  colour: string; label: string; value: number; hollow?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={hollow
          ? { border: `1.5px solid ${colour}` }
          : { background: colour }}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <span className="text-xs font-semibold text-foreground tabular-nums">{value}</span>
    </li>
  );
}
