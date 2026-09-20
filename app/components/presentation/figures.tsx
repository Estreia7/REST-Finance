'use client';

/**
 * The drawings that carry the sales argument.
 *
 * These began inside the admin console's presentation panel. They now live on
 * their own because the same figures are shown in two places: the panel, which
 * a person scrolls while sitting across from an owner, and the unattended
 * deck at /pt and /en, which advances by itself on a television. Two copies of
 * a hand-authored SVG would have drifted apart within a month.
 *
 * Two rules shape everything below.
 *
 * First, the drawings are the argument. A restaurant owner will not read four
 * paragraphs about Prime Cost, but they will look at a dial and immediately ask
 * "where am I on that?" — which is the conversation we want. So every
 * capability is carried by a hand-authored SVG that explains the mechanic, and
 * the prose underneath is deliberately short: the person presenting does the
 * talking.
 *
 * Second, no invented numbers. The figures inside the illustrations are
 * plausible shapes, labelled as an example, never presented as a statistic or
 * as this owner's own result.
 *
 * The SVGs are inline rather than a chart library because they are diagrams,
 * not data: a waterfall here has fixed proportions chosen to read well at a
 * glance, and a charting runtime would only get in the way. They paint with
 * hsl(var(--token)) and currentColor so dark mode needs no second version.
 */


// ─── Shared SVG helpers ───────────────────────────────────────────────────────

/**
 * Every illustration is drawn on a fixed viewBox and scaled by its container,
 * so one set of coordinates works from a 380px phone up to a presentation
 * laptop without a second layout.
 */
export type FigureProps = { title: string };

/** Muted hairline used for baselines and grid rules across the figures. */
export const RULE = 'hsl(var(--border))';

// ─── Figure 1: the shoebox and the spreadsheet ───────────────────────────────

/**
 * The problem, drawn. A leaning stack of paper on the left, a spreadsheet with
 * a stale, half-filled grid on the right, and nothing connecting them — the gap
 * down the middle is the whole point of the picture.
 */
export function ShoeboxFigure({ title }: FigureProps) {
  return (
    <svg viewBox="0 0 320 150" className="w-full h-auto" role="img" aria-labelledby="pres-shoebox-title">
      <title id="pres-shoebox-title">{title}</title>

      {/* Loose invoices, each rotated a little so the pile reads as unsorted */}
      {[
        { x: 18, y: 74, r: -9 },
        { x: 26, y: 62, r: 5 },
        { x: 22, y: 50, r: -4 },
        { x: 30, y: 38, r: 8 },
      ].map((s, i) => (
        <g key={i} transform={`rotate(${s.r} ${s.x + 32} ${s.y + 20})`}>
          <rect
            x={s.x} y={s.y} width={64} height={40} rx={3}
            fill="hsl(var(--card))" stroke={RULE} strokeWidth={1.5}
          />
          {[8, 15, 22, 29].map((dy) => (
            <line
              key={dy}
              x1={s.x + 7} y1={s.y + dy} x2={s.x + (dy === 29 ? 38 : 55)} y2={s.y + dy}
              stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeLinecap="round" opacity={0.45}
            />
          ))}
        </g>
      ))}

      {/* The box they land in */}
      <path
        d="M8 112 L14 132 H118 L124 112 Z"
        fill="hsl(var(--muted))" stroke={RULE} strokeWidth={1.5} strokeLinejoin="round"
      />
      <line x1="8" y1="112" x2="124" y2="112" stroke={RULE} strokeWidth={1.5} />

      {/* The gap: no arrow, nothing crossing it */}
      <line
        x1="150" y1="24" x2="150" y2="128"
        stroke={RULE} strokeWidth={1.5} strokeDasharray="4 6" strokeLinecap="round"
      />

      {/* Spreadsheet, mostly empty and out of date */}
      <rect x="182" y="24" width="128" height="104" rx={6} fill="hsl(var(--card))" stroke={RULE} strokeWidth={1.5} />
      <rect x="182" y="24" width="128" height="16" rx={6} fill="hsl(var(--muted))" />
      <rect x="182" y="34" width="128" height="6" fill="hsl(var(--muted))" />
      <line x1="182" y1="40" x2="310" y2="40" stroke={RULE} strokeWidth={1.5} />
      {[64, 80, 96, 112].map((y) => (
        <line key={y} x1="182" y1={y} x2="310" y2={y} stroke={RULE} strokeWidth={1} opacity={0.7} />
      ))}
      {[214, 246, 278].map((x) => (
        <line key={x} x1={x} y1="40" x2={x} y2="128" stroke={RULE} strokeWidth={1} opacity={0.7} />
      ))}
      {/* Only the first rows carry anything; the rest were never filled in */}
      {[
        { x: 190, y: 52, w: 16 },
        { x: 222, y: 52, w: 14 },
        { x: 190, y: 68, w: 18 },
        { x: 254, y: 68, w: 12 },
        { x: 190, y: 84, w: 13 },
      ].map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={c.w} height={5} rx={2.5} fill="hsl(var(--muted-foreground))" opacity={0.45} />
      ))}
      {/* Two cells in error — the formula nobody maintains any more */}
      <rect x="286" y="100" width="16" height="5" rx={2.5} fill="hsl(var(--lamp-danger))" opacity={0.6} />
      <rect x="222" y="116" width="14" height="5" rx={2.5} fill="hsl(var(--lamp-danger))" opacity={0.6} />
    </svg>
  );
}

// ─── Figure 2: invoice → items → tracked cost ────────────────────────────────

/** The capture flow, as three stations with the movement drawn between them. */
export function FlowFigure({ title }: FigureProps) {
  return (
    <svg viewBox="0 0 360 120" className="w-full h-auto" role="img" aria-labelledby="pres-flow-title">
      <title id="pres-flow-title">{title}</title>

      {/* 1 — a phone photographing a receipt */}
      <rect x="14" y="18" width="52" height="84" rx={8} fill="hsl(var(--card))" stroke={RULE} strokeWidth={1.5} />
      <rect x="21" y="27" width="38" height="60" rx={3} fill="hsl(var(--muted))" />
      {/* the receipt inside the viewfinder */}
      <path d="M28 36 h24 v42 l-4 -3 -4 3 -4 -3 -4 3 -4 -3 -4 3 Z" fill="hsl(var(--card))" stroke={RULE} strokeWidth={1} />
      {[42, 48, 54, 60, 66].map((y) => (
        <line key={y} x1="32" y1={y} x2={y === 66 ? 44 : 48} y2={y} stroke="hsl(var(--muted-foreground))" strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
      ))}
      <circle cx="40" cy="94" r={4} fill="hsl(var(--primary))" />

      <path d="M74 60 h24" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" />
      <path d="M94 55 l6 5 -6 5" fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* 2 — the lines lifted off it, each with a value */}
      <rect x="110" y="22" width="108" height="76" rx={6} fill="hsl(var(--card))" stroke={RULE} strokeWidth={1.5} />
      {[34, 52, 70].map((y, i) => (
        <g key={y}>
          <rect x="118" y={y} width={[44, 54, 38][i]} height={6} rx={3} fill="hsl(var(--muted-foreground))" opacity={0.45} />
          <rect x="182" y={y} width={28} height={6} rx={3} fill="hsl(var(--primary))" opacity={0.75} />
        </g>
      ))}
      {/* a tick: the owner confirms rather than types */}
      <path d="M118 86 l5 5 9 -11" fill="none" stroke="hsl(var(--lamp-success))" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="140" y="86" width="46" height="6" rx={3} fill="hsl(var(--muted-foreground))" opacity={0.3} />

      <path d="M226 60 h24" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" />
      <path d="M246 55 l6 5 -6 5" fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* 3 — the cost, now a line on a chart that keeps moving */}
      <rect x="262" y="22" width="84" height="76" rx={6} fill="hsl(var(--card))" stroke={RULE} strokeWidth={1.5} />
      <line x1="272" y1="84" x2="338" y2="84" stroke={RULE} strokeWidth={1.5} />
      {[
        { x: 274, h: 18 },
        { x: 287, h: 28 },
        { x: 300, h: 24 },
        { x: 313, h: 38 },
        { x: 326, h: 46 },
      ].map((b) => (
        <rect key={b.x} x={b.x} y={84 - b.h} width={9} height={b.h} rx={2} fill="hsl(var(--primary))" opacity={0.85} />
      ))}
    </svg>
  );
}

// ─── Figure 3: before / after ────────────────────────────────────────────────

/** Scattered, overlapping fragments on the left; one ordered panel on the right. */
export function BeforeAfterFigure({ title }: FigureProps) {
  return (
    <svg viewBox="0 0 340 130" className="w-full h-auto" role="img" aria-labelledby="pres-beforeafter-title">
      <title id="pres-beforeafter-title">{title}</title>

      {/* Before — six scraps at odd angles, none aligned to another */}
      {[
        { x: 12, y: 18, w: 42, h: 30, r: -12 },
        { x: 58, y: 12, w: 36, h: 26, r: 9 },
        { x: 22, y: 54, w: 48, h: 26, r: 6 },
        { x: 74, y: 46, w: 34, h: 34, r: -7 },
        { x: 14, y: 86, w: 40, h: 24, r: 4 },
        { x: 62, y: 88, w: 46, h: 22, r: -10 },
      ].map((s, i) => (
        <g key={i} transform={`rotate(${s.r} ${s.x + s.w / 2} ${s.y + s.h / 2})`}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill="hsl(var(--card))" stroke={RULE} strokeWidth={1.3} />
          <line x1={s.x + 5} y1={s.y + 9} x2={s.x + s.w - 8} y2={s.y + 9} stroke="hsl(var(--muted-foreground))" strokeWidth={1.3} strokeLinecap="round" opacity={0.4} />
          <line x1={s.x + 5} y1={s.y + 16} x2={s.x + s.w - 14} y2={s.y + 16} stroke="hsl(var(--muted-foreground))" strokeWidth={1.3} strokeLinecap="round" opacity={0.4} />
        </g>
      ))}

      {/* The transition */}
      <path d="M136 65 h34" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M164 58 l8 7 -8 7" fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* After — one panel, on a grid, with a headline figure and a trend */}
      <rect x="190" y="16" width="138" height="98" rx={8} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={1.8} />
      <rect x="190" y="16" width="138" height="18" rx={8} fill="hsl(var(--primary))" opacity={0.12} />
      <rect x="190" y="28" width="138" height="6" fill="hsl(var(--primary))" opacity={0.12} />
      <rect x="198" y="22" width="34" height="6" rx={3} fill="hsl(var(--primary))" opacity={0.8} />

      {/* Three aligned stat tiles */}
      {[198, 244, 290].map((x) => (
        <g key={x}>
          <rect x={x} y={42} width={30} height={22} rx={4} fill="hsl(var(--muted))" />
          <rect x={x + 5} y={47} width={14} height={5} rx={2.5} fill="hsl(var(--foreground))" opacity={0.7} />
          <rect x={x + 5} y={55} width={20} height={4} rx={2} fill="hsl(var(--muted-foreground))" opacity={0.5} />
        </g>
      ))}

      {/* A trend line that actually goes somewhere */}
      <polyline
        points="198,102 218,94 238,97 258,86 278,80 298,84 318,72"
        fill="none" stroke="hsl(var(--primary))" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="318" cy="72" r={3.5} fill="hsl(var(--primary))" />
      <line x1="198" y1="108" x2="320" y2="108" stroke={RULE} strokeWidth={1.2} />
    </svg>
  );
}

// ─── Figure 4: Prime Cost dial ───────────────────────────────────────────────

/**
 * A 180-degree dial. The bands are the point: a Prime Cost figure means nothing
 * on its own, and the healthy / watch / critical arcs give the owner somewhere
 * to place their own number the moment they see it.
 */
export function PrimeCostFigure({
  title, healthy, watch, high, caption,
}: FigureProps & { healthy: string; watch: string; high: string; caption: string }) {
  // Geometry for a half-circle dial of radius 76 about (110, 96).
  const cx = 110;
  const cy = 96;
  const r = 76;
  const pt = (deg: number, radius = r) => {
    const rad = (Math.PI * deg) / 180;
    return [cx - radius * Math.cos(rad), cy - radius * Math.sin(rad)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  // The needle sits inside the watch band: an illustrative position, not a claim.
  const [nx, ny] = pt(84, r - 20);

  return (
    <svg viewBox="0 0 220 138" className="w-full h-auto" role="img" aria-labelledby="pres-prime-title">
      <title id="pres-prime-title">{title}</title>

      <path d={arc(0, 70)} fill="none" stroke="hsl(var(--lamp-success))" strokeWidth={16} strokeLinecap="round" opacity={0.85} />
      <path d={arc(74, 116)} fill="none" stroke="hsl(var(--lamp-warning))" strokeWidth={16} strokeLinecap="round" opacity={0.85} />
      <path d={arc(120, 180)} fill="none" stroke="hsl(var(--lamp-danger))" strokeWidth={16} strokeLinecap="round" opacity={0.85} />

      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="hsl(var(--foreground))" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={2.5} />

      {/* Band labels, placed outside their own arcs */}
      <text x="16" y="118" fontSize="9" fontWeight={600} fill="hsl(var(--lamp-success))">{healthy}</text>
      <text x="110" y="14" fontSize="9" fontWeight={600} fill="hsl(var(--lamp-warning))" textAnchor="middle">{watch}</text>
      <text x="204" y="118" fontSize="9" fontWeight={600} fill="hsl(var(--lamp-danger))" textAnchor="end">{high}</text>

      <text x="110" y="132" fontSize="8.5" fill="hsl(var(--muted-foreground))" textAnchor="middle">{caption}</text>
    </svg>
  );
}

// ─── Figure 5: revenue-to-profit waterfall ───────────────────────────────────

/**
 * The waterfall runs left to right: a full revenue column, three deductions
 * that float where the previous one left off, and the profit that remains.
 * Drawn at fixed proportions — it is a diagram of the mechanic, not a reading.
 */
export function WaterfallFigure({
  title, revenue, goods, staff, fixed, profit,
}: FigureProps & { revenue: string; goods: string; staff: string; fixed: string; profit: string }) {
  const base = 96;
  const scale = 0.78; // percentage points to pixels

  // Each step: the share it removes, in points of revenue.
  const steps = [
    { label: goods, drop: 31, fill: 'hsl(var(--pnl-cogs))' },
    { label: staff, drop: 30, fill: 'hsl(var(--pnl-labour))' },
    { label: fixed, drop: 24, fill: 'hsl(var(--pnl-opex))' },
  ];

  let running = 100;
  const cols: Array<{ x: number; y: number; h: number; fill: string; label: string }> = [
    { x: 8, y: base - 100 * scale, h: 100 * scale, fill: 'hsl(var(--pnl-revenue))', label: revenue },
  ];
  steps.forEach((s, i) => {
    const top = running;
    running -= s.drop;
    cols.push({ x: 8 + (i + 1) * 58, y: base - top * scale, h: s.drop * scale, fill: s.fill, label: s.label });
  });
  cols.push({ x: 8 + 4 * 58, y: base - running * scale, h: running * scale, fill: 'hsl(var(--primary))', label: profit });

  return (
    <svg viewBox="0 0 300 124" className="w-full h-auto" role="img" aria-labelledby="pres-waterfall-title">
      <title id="pres-waterfall-title">{title}</title>

      <line x1="4" y1={base} x2="296" y2={base} stroke={RULE} strokeWidth={1.5} />

      {cols.map((c, i) => (
        <g key={c.label}>
          <rect x={c.x} y={c.y} width={44} height={Math.max(c.h, 3)} rx={3} fill={c.fill} opacity={i === 0 || i === cols.length - 1 ? 0.95 : 0.8} />
          {/* Connector to the next column, so the eye follows the drop */}
          {i < cols.length - 1 && (
            <line
              x1={c.x + 44} y1={i === 0 ? c.y : c.y + c.h}
              x2={c.x + 58} y2={i === 0 ? c.y : c.y + c.h}
              stroke={RULE} strokeWidth={1.5} strokeDasharray="3 3"
            />
          )}
          <text x={c.x + 22} y={base + 14} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle">{c.label}</text>
        </g>
      ))}

      {/* The remaining sliver is easy to miss, so it is called out */}
      <line x1={cols[4].x + 22} y1={cols[4].y - 6} x2={cols[4].x + 22} y2={cols[4].y - 22} stroke="hsl(var(--primary))" strokeWidth={1.5} />
      <circle cx={cols[4].x + 22} cy={cols[4].y - 25} r={3} fill="hsl(var(--primary))" />
    </svg>
  );
}

// ─── Figure 6: dish cost breakdown ───────────────────────────────────────────

/**
 * One horizontal bar for the menu price, with the ingredient costs stacked from
 * the left and the margin left over on the right. Easier to argue from than a
 * pie: the owner can see the margin get squeezed as a cost grows.
 */
export function DishFigure({
  title, price, cost, margin, one, two, three,
}: FigureProps & { price: string; cost: string; margin: string; one: string; two: string; three: string }) {
  // Widths in pixels across a 276px bar; illustrative proportions.
  const parts = [
    { w: 74, fill: 'hsl(var(--pnl-cogs))', label: one },
    { w: 42, fill: 'hsl(var(--pnl-occupancy))', label: two },
    { w: 26, fill: 'hsl(var(--pnl-labour))', label: three },
  ];
  let x = 12;

  return (
    <svg viewBox="0 0 300 132" className="w-full h-auto" role="img" aria-labelledby="pres-dish-title">
      <title id="pres-dish-title">{title}</title>

      <text x="12" y="16" fontSize="9" fontWeight={600} fill="hsl(var(--muted-foreground))">{price}</text>

      {/* The full menu price as an outline the costs must fit inside */}
      <rect x="12" y="26" width="276" height="28" rx={4} fill="hsl(var(--muted))" stroke={RULE} strokeWidth={1.3} />

      {parts.map((p) => {
        const rect = <rect key={p.label} x={x} y={26} width={p.w} height={28} fill={p.fill} opacity={0.85} />;
        x += p.w;
        return rect;
      })}
      {/* Margin: what the outline still has room for once the costs are in */}
      <rect x={x} y={26} width={288 - x} height={28} fill="hsl(var(--primary))" opacity={0.9} />
      {/* Rounded ends, drawn over the flat segment edges */}
      <rect x="12" y="26" width="276" height="28" rx={4} fill="none" stroke={RULE} strokeWidth={1.3} />

      {/* Legend, wrapped onto two rows so it survives a narrow column */}
      {parts.map((p, i) => (
        <g key={p.label}>
          <rect x={12 + i * 92} y={68} width={9} height={9} rx={2} fill={p.fill} opacity={0.85} />
          <text x={26 + i * 92} y={76} fontSize="8" fill="hsl(var(--muted-foreground))">{p.label}</text>
        </g>
      ))}
      <g>
        <rect x="12" y="88" width={9} height={9} rx={2} fill="hsl(var(--pnl-cogs))" opacity={0.35} />
        <text x="26" y="96" fontSize="8" fill="hsl(var(--muted-foreground))">{cost}</text>
        <rect x="150" y="88" width={9} height={9} rx={2} fill="hsl(var(--primary))" opacity={0.9} />
        <text x="164" y="96" fontSize="8" fontWeight={600} fill="hsl(var(--primary))">{margin}</text>
      </g>

      {/* Bracket under the margin, tying the legend back to the bar */}
      <path
        d={`M${x} 60 v4 h${288 - x} v-4`}
        fill="none" stroke="hsl(var(--primary))" strokeWidth={1.4} strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Figure 7: sales vs costs, month by month ────────────────────────────────

/** Paired bars per month. The shrinking gap in the later months is the story. */
export function RevenueVsCostFigure({
  title, sales, costs,
}: FigureProps & { sales: string; costs: string }) {
  const base = 92;
  // Illustrative shapes: costs climb faster than sales in the back half.
  const months = [
    { s: 58, c: 34 },
    { s: 64, c: 40 },
    { s: 56, c: 38 },
    { s: 70, c: 50 },
    { s: 66, c: 54 },
    { s: 72, c: 63 },
  ];

  return (
    <svg viewBox="0 0 300 120" className="w-full h-auto" role="img" aria-labelledby="pres-revcost-title">
      <title id="pres-revcost-title">{title}</title>

      {/* Grid rules behind the bars, faint enough not to compete */}
      {[92, 72, 52, 32].map((y) => (
        <line key={y} x1="10" y1={y} x2="290" y2={y} stroke={RULE} strokeWidth={1} opacity={y === 92 ? 1 : 0.5} />
      ))}

      {months.map((m, i) => {
        const x = 22 + i * 45;
        return (
          <g key={i}>
            <rect x={x} y={base - m.s} width={15} height={m.s} rx={2.5} fill="hsl(var(--pnl-revenue))" opacity={0.9} />
            <rect x={x + 18} y={base - m.c} width={15} height={m.c} rx={2.5} fill="hsl(var(--pnl-cogs))" opacity={0.8} />
          </g>
        );
      })}

      <g>
        <rect x="10" y="104" width={9} height={9} rx={2} fill="hsl(var(--pnl-revenue))" opacity={0.9} />
        <text x="24" y="112" fontSize="8.5" fill="hsl(var(--muted-foreground))">{sales}</text>
        <rect x="118" y="104" width={9} height={9} rx={2} fill="hsl(var(--pnl-cogs))" opacity={0.8} />
        <text x="132" y="112" fontSize="8.5" fill="hsl(var(--muted-foreground))">{costs}</text>
      </g>
    </svg>
  );
}

// ─── Figure 8: the week's rota ───────────────────────────────────────────────

/** Seven day columns with shift blocks, and the running cost totalled beneath. */
export function RotaFigure({ title, costLabel }: FigureProps & { costLabel: string }) {
  // Shifts as [day index, start row, length] — lunch and dinner services.
  const shifts = [
    { d: 0, y: 30, h: 18 }, { d: 0, y: 54, h: 22 },
    { d: 1, y: 30, h: 18 }, { d: 1, y: 54, h: 22 },
    { d: 2, y: 30, h: 18 },
    { d: 3, y: 30, h: 18 }, { d: 3, y: 54, h: 26 },
    { d: 4, y: 26, h: 22 }, { d: 4, y: 54, h: 30 },
    { d: 5, y: 26, h: 22 }, { d: 5, y: 54, h: 30 },
    { d: 6, y: 30, h: 26 },
  ];

  return (
    <svg viewBox="0 0 300 122" className="w-full h-auto" role="img" aria-labelledby="pres-rota-title">
      <title id="pres-rota-title">{title}</title>

      {/* Day columns */}
      {Array.from({ length: 7 }, (_, d) => (
        <rect
          key={d} x={10 + d * 41} y={14} width={34} height={76} rx={4}
          fill="hsl(var(--muted))" opacity={0.55}
        />
      ))}

      {shifts.map((s, i) => (
        <rect
          key={i} x={13 + s.d * 41} y={s.y} width={28} height={s.h} rx={3}
          fill="hsl(var(--pnl-labour))" opacity={0.85}
        />
      ))}

      {/* The running cost, drawn as a bar that fills as the week is built */}
      <text x="10" y="106" fontSize="8.5" fill="hsl(var(--muted-foreground))">{costLabel}</text>
      <rect x="10" y="110" width="280" height="7" rx={3.5} fill="hsl(var(--muted))" />
      <rect x="10" y="110" width="196" height="7" rx={3.5} fill="hsl(var(--primary))" />
    </svg>
  );
}

// ─── Figure 9: tax building towards a due date ───────────────────────────────

/** A month of day cells, an amount growing across it, and the deadline flagged. */
export function TaxFigure({
  title, setAside, due,
}: FigureProps & { setAside: string; due: string }) {
  const cells = Array.from({ length: 28 }, (_, i) => i);

  return (
    <svg viewBox="0 0 300 128" className="w-full h-auto" role="img" aria-labelledby="pres-tax-title">
      <title id="pres-tax-title">{title}</title>

      {/* Calendar grid — 7 x 4, the day cells shading in as the month runs */}
      {cells.map((i) => {
        const col = i % 7;
        const row = Math.floor(i / 7);
        // Fills progressively: the further into the month, the more is owed.
        const filled = i < 22;
        return (
          <rect
            key={i}
            x={10 + col * 26} y={16 + row * 20} width={21} height={15} rx={3}
            fill={filled ? 'hsl(var(--primary))' : 'hsl(var(--muted))'}
            opacity={filled ? 0.15 + (i / 28) * 0.55 : 0.5}
          />
        );
      })}

      {/* The deadline, on the last cell of the grid */}
      <rect x={10 + 6 * 26} y={16 + 3 * 20} width={21} height={15} rx={3} fill="none" stroke="hsl(var(--lamp-danger))" strokeWidth={2} />
      <text x={10 + 6 * 26 + 10.5} y={16 + 3 * 20 + 11} fontSize="8" fontWeight={700} fill="hsl(var(--lamp-danger))" textAnchor="middle">!</text>

      {/* The amount accumulating, as a step line rising into the deadline */}
      <polyline
        points="204,112 222,108 240,100 258,90 276,76 288,68"
        fill="none" stroke="hsl(var(--primary))" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      />
      <text x="10" y="112" fontSize="8.5" fill="hsl(var(--muted-foreground))">{setAside}</text>
      <text x="10" y="124" fontSize="8.5" fontWeight={600} fill="hsl(var(--lamp-danger))">{due}</text>
    </svg>
  );
}

// ─── Figure 10: compliance checklist with status lamps ───────────────────────

/** Four documents, each with its own lamp — the exact shape of the real panel. */
export function ComplianceFigure({
  title, items, ok, soon, late,
}: FigureProps & { items: string[]; ok: string; soon: string; late: string }) {
  const lamps = [
    { colour: 'hsl(var(--lamp-success))', status: ok },
    { colour: 'hsl(var(--lamp-success))', status: ok },
    { colour: 'hsl(var(--lamp-warning))', status: soon },
    { colour: 'hsl(var(--lamp-danger))', status: late },
  ];

  return (
    <svg viewBox="0 0 300 122" className="w-full h-auto" role="img" aria-labelledby="pres-compliance-title">
      <title id="pres-compliance-title">{title}</title>

      {items.slice(0, 4).map((label, i) => {
        const y = 8 + i * 28;
        const lamp = lamps[i];
        return (
          <g key={label}>
            <rect x="8" y={y} width="284" height="24" rx={5} fill="hsl(var(--muted))" opacity={0.45} />
            {/* The lamp gets a ring as well as a fill: colour alone is not a
                status for someone who cannot tell green from amber. */}
            <circle cx="24" cy={y + 12} r={6} fill={lamp.colour} opacity={0.2} />
            <circle cx="24" cy={y + 12} r={3.5} fill={lamp.colour} />
            <text x="40" y={y + 16} fontSize="9" fill="hsl(var(--foreground))">{label}</text>
            <text x="284" y={y + 16} fontSize="8" fontWeight={600} fill={lamp.colour} textAnchor="end">{lamp.status}</text>
          </g>
        );
      })}
    </svg>
  );
}

