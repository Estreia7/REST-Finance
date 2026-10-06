import { describe, it, expect } from 'vitest';
import {
  buildGraph,
  seedPositions,
  step,
  nodeAt,
  SETTLED,
  DEFAULT_SETTINGS,
  type GraphNode,
  type GraphEdge,
} from '@/lib/force-graph';

/** Runs the simulation until it settles, or gives up. */
function settle(nodes: GraphNode[], edges: GraphEdge[], w = 800, h = 600, max = 2000) {
  let frames = 0;
  let movement = Infinity;
  while (frames < max && movement > SETTLED) {
    movement = step(nodes, edges, w, h);
    frames++;
  }
  return { frames, movement };
}

const MENU = {
  dishes: [
    { id: 'd1', name: 'SMASHIE DUPLO', category: 'MENUS', monthlyVolume: 130 },
    { id: 'd2', name: 'SMASHIE SIMPLES', category: 'MENUS', monthlyVolume: 115 },
    { id: 'd3', name: 'SEM RECEITA', category: 'COMIDAS', monthlyVolume: 40 },
  ],
  ingredients: [
    { id: 'i1', name: 'Pão Hamburguer' },
    { id: 'i2', name: 'Carne Smash' },
    { id: 'i3', name: 'NUNCA USADO' },
  ],
  lines: [
    { menuItemId: 'd1', ingredientId: 'i1' },
    { menuItemId: 'd1', ingredientId: 'i2' },
    { menuItemId: 'd2', ingredientId: 'i1' },
  ],
};

describe('building the graph from a menu', () => {
  it('makes a node of every dish and every ingredient', () => {
    const { nodes } = buildGraph(MENU);
    expect(nodes).toHaveLength(6);
    expect(nodes.filter((n) => n.kind === 'dish')).toHaveLength(3);
    expect(nodes.filter((n) => n.kind === 'ingredient')).toHaveLength(3);
  });

  it('links a dish to what goes in it', () => {
    const { edges } = buildGraph(MENU);
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({ source: 'dish:d1', target: 'ing:i1' });
  });

  it('marks what has nothing attached to it', () => {
    // The point of the map as much as the links are: a dish with no recipe
    // cannot be costed, and it should be visible as a thing left to do.
    const { nodes } = buildGraph(MENU);
    const orphans = nodes.filter((n) => n.orphan).map((n) => n.label);
    expect(orphans).toEqual(['SEM RECEITA', 'NUNCA USADO']);
  });

  it('sizes an ingredient by how many dishes use it', () => {
    // The bun half the menu hangs off should be the big circle.
    const { nodes } = buildGraph(MENU);
    const bun = nodes.find((n) => n.label === 'Pão Hamburguer')!;
    const meat = nodes.find((n) => n.label === 'Carne Smash')!;
    expect(bun.weight).toBe(2);
    expect(meat.weight).toBe(1);
  });

  it('sizes a dish by what it sells', () => {
    const { nodes } = buildGraph(MENU);
    expect(nodes.find((n) => n.label === 'SMASHIE DUPLO')!.weight).toBe(130);
  });
});

describe('the simulation', () => {
  it('settles rather than running forever', () => {
    const { nodes, edges } = buildGraph(MENU);
    seedPositions(nodes, 800, 600);
    const { frames, movement } = settle(nodes, edges);
    expect(movement).toBeLessThanOrEqual(SETTLED);
    expect(frames).toBeLessThan(2000);
  });

  it('keeps every node on a real coordinate', () => {
    // A NaN anywhere spreads through the whole layout in a frame or two and
    // the screen goes blank with no error.
    const { nodes, edges } = buildGraph(MENU);
    seedPositions(nodes, 800, 600);
    settle(nodes, edges);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it('does not fling anything off the canvas', () => {
    const { nodes, edges } = buildGraph(MENU);
    seedPositions(nodes, 800, 600);
    settle(nodes, edges);
    // Generous, but a node at 50,000 is a bug, not a layout.
    for (const n of nodes) {
      expect(Math.abs(n.x)).toBeLessThan(5000);
      expect(Math.abs(n.y)).toBeLessThan(5000);
    }
  });

  it('pulls linked nodes closer than unlinked ones', () => {
    // The whole point: a dish ends up beside what goes in it.
    const { nodes, edges } = buildGraph(MENU);
    seedPositions(nodes, 800, 600);
    settle(nodes, edges);

    const duplo = nodes.find((n) => n.id === 'dish:d1')!;
    const bun = nodes.find((n) => n.id === 'ing:i1')!;
    const unused = nodes.find((n) => n.id === 'ing:i3')!;

    const linked = Math.hypot(duplo.x - bun.x, duplo.y - bun.y);
    const unlinked = Math.hypot(duplo.x - unused.x, duplo.y - unused.y);
    expect(linked).toBeLessThan(unlinked);
  });

  it('survives two nodes landing on the same point', () => {
    // Zero distance means infinite repulsion, which is NaN everywhere by the
    // next frame. The nudge has to be deterministic, not random, or the bug
    // comes back in one layout out of a hundred.
    const nodes: GraphNode[] = [
      { id: 'a', label: 'A', kind: 'dish', weight: 1, orphan: true, group: null, x: 100, y: 100, vx: 0, vy: 0 },
      { id: 'b', label: 'B', kind: 'dish', weight: 1, orphan: true, group: null, x: 100, y: 100, vx: 0, vy: 0 },
    ];
    step(nodes, [], 800, 600);
    expect(Number.isFinite(nodes[0].x)).toBe(true);
    expect(Number.isFinite(nodes[1].x)).toBe(true);
    expect(nodes[0].x).not.toBe(nodes[1].x);
  });

  it('leaves a dragged node where it was put', () => {
    const { nodes, edges } = buildGraph(MENU);
    seedPositions(nodes, 800, 600);
    const held = nodes[0];
    held.fixed = true;
    held.x = 123;
    held.y = 456;

    for (let i = 0; i < 50; i++) step(nodes, edges, 800, 600);
    expect(held.x).toBe(123);
    expect(held.y).toBe(456);
  });

  it('handles a graph with no links at all', () => {
    // Which is exactly the state a menu is in before any recipe is written,
    // so it must not be the case that breaks.
    const { nodes } = buildGraph({ ...MENU, lines: [] });
    seedPositions(nodes, 800, 600);
    const { movement } = settle(nodes, []);
    expect(movement).toBeLessThanOrEqual(SETTLED);
    expect(nodes.every((n) => Number.isFinite(n.x))).toBe(true);
  });

  it('handles a single node', () => {
    const { nodes } = buildGraph({ dishes: [MENU.dishes[0]], ingredients: [], lines: [] });
    seedPositions(nodes, 800, 600);
    settle(nodes, []);
    // Near the middle, since nothing pushes back. Not exactly on it: the
    // simulation stops once it is barely moving, which is a few pixels
    // short — and chasing the last pixel would mean running frames that
    // change nothing anyone can see.
    expect(Math.abs(nodes[0].x - 400)).toBeLessThan(20);
    expect(Math.abs(nodes[0].y - 300)).toBeLessThan(20);
  });

  it('handles an empty graph without dividing by zero', () => {
    const nodes: GraphNode[] = [];
    seedPositions(nodes, 800, 600);
    expect(step(nodes, [], 800, 600)).toBe(0);
  });
});

describe('hit testing', () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: 'A', kind: 'dish', weight: 1, orphan: false, group: null, x: 100, y: 100, vx: 0, vy: 0 },
    { id: 'b', label: 'B', kind: 'dish', weight: 1, orphan: false, group: null, x: 300, y: 300, vx: 0, vy: 0 },
  ];
  const radius = () => 10;

  it('finds the node under the point', () => {
    expect(nodeAt(nodes, 102, 98, radius)?.id).toBe('a');
  });

  it('finds nothing in empty space', () => {
    expect(nodeAt(nodes, 700, 500, radius)).toBeNull();
  });

  it('is forgiving, because a finger is not a pixel', () => {
    // 13px out from a 10px circle still counts: these are small targets on
    // a phone and a near miss reads as the tap having failed.
    expect(nodeAt(nodes, 113, 100, radius)?.id).toBe('a');
  });

  it('prefers the one drawn on top when they overlap', () => {
    const stacked: GraphNode[] = [
      { ...nodes[0], id: 'under', x: 200, y: 200 },
      { ...nodes[0], id: 'over', x: 200, y: 200 },
    ];
    expect(nodeAt(stacked, 200, 200, radius)?.id).toBe('over');
  });
});

describe('the settings', () => {
  it('damps below one, or the layout never comes to rest', () => {
    expect(DEFAULT_SETTINGS.damping).toBeLessThan(1);
    expect(DEFAULT_SETTINGS.damping).toBeGreaterThan(0);
  });
});
