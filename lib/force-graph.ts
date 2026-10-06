/**
 * A force-directed layout, small enough to own.
 *
 * Three forces, which is all a graph this size needs:
 *
 *   - **repulsion** pushes every node away from every other, so they spread
 *     instead of piling up
 *   - **springs** pull linked nodes together, so a dish ends up beside the
 *     ingredients it uses
 *   - **centring** stops the whole thing drifting off the canvas
 *
 * The useful property falls out of those on its own: ingredients shared
 * between dishes pull those dishes towards each other, so the clusters form
 * themselves. Half a menu hanging off one bun becomes visible without anyone
 * computing it.
 *
 * Written here rather than installed because d3-force is some 30 KB for one
 * screen, and the parts of it that matter are the ones below. Repulsion is
 * O(n²), which for a few hundred nodes is nothing — a Barnes-Hut tree would
 * be the fix if a menu ever got to thousands, and no menu does.
 */

export interface GraphNode {
  id: string;
  label: string;
  kind: 'dish' | 'ingredient';
  /** Drawn bigger: a dish that sells, an ingredient that many dishes use. */
  weight: number;
  /** Nothing links to it — a dish with no recipe, an ingredient unused. */
  orphan: boolean;
  /** The family, for colour. */
  group: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held still while dragged, so physics does not fight the finger. */
  fixed?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface SimulationSettings {
  /** How hard nodes push each other apart. */
  repulsion: number;
  /** How hard a link pulls, 0–1. */
  springStrength: number;
  /** The length a link settles at. */
  springLength: number;
  /** Pull towards the middle, which keeps the drawing on screen. */
  centring: number;
  /** Velocity kept each step. Below 1 or it never settles. */
  damping: number;
}

/**
 * Settled by sweeping them, not by taste.
 *
 * The spring length is the one that matters and the one that was wrong:
 * at 90 it sat *above* the distance repulsion settles at, so a link was
 * pushing its two nodes apart instead of pulling them together — linked
 * pairs ended up further from each other than unrelated ones, which is the
 * opposite of what the whole drawing is for. At 50 the spring pulls, and
 * a linked pair lands around 54px against 85px for an unrelated one.
 */
export const DEFAULT_SETTINGS: SimulationSettings = {
  repulsion: 2600,
  springStrength: 0.15,
  springLength: 50,
  centring: 0.012,
  damping: 0.86,
};

/**
 * Lays nodes out on a circle to start.
 *
 * Not at random: a random start sometimes drops two nodes on the same point,
 * where the distance is zero and the repulsion between them is infinite. A
 * ring guarantees everything begins apart, and it unfolds more calmly.
 */
export function seedPositions(nodes: GraphNode[], width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  nodes.forEach((node, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    // Two rings, so a large menu does not start as one thin circle.
    const r = radius * (i % 2 === 0 ? 1 : 0.6);
    node.x = cx + Math.cos(angle) * r;
    node.y = cy + Math.sin(angle) * r;
    node.vx = 0;
    node.vy = 0;
  });
}

/**
 * Advances the simulation one frame.
 *
 * Returns how much everything moved, so a caller can stop drawing once the
 * layout has settled rather than burning a phone's battery on a still image.
 */
export function step(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  settings: SimulationSettings = DEFAULT_SETTINGS,
): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cx = width / 2;
  const cy = height / 2;

  // Repulsion, every pair once.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distSq = dx * dx + dy * dy;

      // Two nodes exactly on top of each other have no direction to separate
      // in and an infinite force. Nudge them apart deterministically.
      if (distSq < 0.01) {
        dx = (i - j) * 0.1 || 0.1;
        dy = 0.1;
        distSq = dx * dx + dy * dy;
      }

      const dist = Math.sqrt(distSq);
      const force = settings.repulsion / distSq;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // Springs along the links.
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (dist - settings.springLength) * settings.springStrength;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Centring, then integrate.
  let movement = 0;
  for (const node of nodes) {
    if (node.fixed) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }

    node.vx += (cx - node.x) * settings.centring;
    node.vy += (cy - node.y) * settings.centring;

    node.vx *= settings.damping;
    node.vy *= settings.damping;

    // A node flung off by a big repulsion looks like a bug and drags the
    // view with it.
    const speed = Math.hypot(node.vx, node.vy);
    const MAX = 30;
    if (speed > MAX) {
      node.vx = (node.vx / speed) * MAX;
      node.vy = (node.vy / speed) * MAX;
    }

    node.x += node.vx;
    node.y += node.vy;
    movement += Math.abs(node.vx) + Math.abs(node.vy);
  }

  return movement / Math.max(1, nodes.length);
}

/** Below this the layout has settled and drawing can stop. */
export const SETTLED = 0.08;

/** The node under a point, or null. Topmost first, as drawn. */
export function nodeAt(
  nodes: GraphNode[],
  x: number,
  y: number,
  radiusOf: (node: GraphNode) => number,
): GraphNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    // A generous target: these are small circles and a finger is not.
    const r = Math.max(radiusOf(node), 14);
    if (Math.hypot(node.x - x, node.y - y) <= r) return node;
  }
  return null;
}

/**
 * Builds the graph from a menu.
 *
 * `orphan` is the point of the thing as much as the links are: a dish with no
 * recipe cannot be costed, and on the map it is a dim circle floating on its
 * own — which says what is left to do without a progress bar having to say it.
 */
export function buildGraph(input: {
  dishes: Array<{ id: string; name: string; category: string | null; monthlyVolume: number | null }>;
  ingredients: Array<{ id: string; name: string }>;
  lines: Array<{ menuItemId: string; ingredientId: string }>;
}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const linkedDishes = new Set(input.lines.map((l) => l.menuItemId));
  const linkedIngredients = new Set(input.lines.map((l) => l.ingredientId));

  const usage = new Map<string, number>();
  for (const line of input.lines) {
    usage.set(line.ingredientId, (usage.get(line.ingredientId) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [
    ...input.dishes.map((d) => ({
      id: `dish:${d.id}`,
      label: d.name,
      kind: 'dish' as const,
      // What it sells, so the dish carrying the room is the big circle.
      weight: d.monthlyVolume ?? 0,
      orphan: !linkedDishes.has(d.id),
      group: d.category,
      x: 0, y: 0, vx: 0, vy: 0,
    })),
    ...input.ingredients.map((i) => ({
      id: `ing:${i.id}`,
      label: i.name,
      kind: 'ingredient' as const,
      // How many dishes use it: the bun half the menu hangs off is big.
      weight: usage.get(i.id) ?? 0,
      orphan: !linkedIngredients.has(i.id),
      group: null,
      x: 0, y: 0, vx: 0, vy: 0,
    })),
  ];

  const edges: GraphEdge[] = input.lines.map((l) => ({
    source: `dish:${l.menuItemId}`,
    target: `ing:${l.ingredientId}`,
  }));

  return { nodes, edges };
}
