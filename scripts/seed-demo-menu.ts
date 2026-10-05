/**
 * Gives the demo account a full three years of trading, at product level.
 *
 * `seed-demo.ts` builds the money: daily takings, goods in, overheads. It
 * says nothing about *what* was sold, because when it was written there was
 * nowhere to put that. Now there is, and without it the Produtos tab and the
 * ingredients ranking are empty on the one account used to show the product
 * to anybody.
 *
 * So this fills in the menu side, for both demo restaurants, from 1 January
 * 2024 to today:
 *
 *   - revenue categories, which the tasca had none of
 *   - a menu per restaurant, priced and weighted so the mix is plausible
 *   - one PosProductSale row per dish per trading day
 *   - DailyCategoryRevenue, rolled up from those sales
 *   - a DailySummary for any day the money seeder did not cover
 *
 * The two restaurants are deliberately different businesses. Tasca da Praça
 * is a Portuguese tasca: fish-led, cheap wine, strong lunch. Tasca do Mercado
 * is a Japanese place: expensive fish, high ticket, dinner-heavy, almost no
 * lunch trade. An owner being shown the app should be able to switch between
 * them and see two genuinely different shapes, not the same curve twice.
 *
 * Usage:  npx tsx scripts/seed-demo-menu.ts [--commit]
 * Safe to re-run: replaces this data for these two restaurants only.
 */
import { prisma } from '../lib/prisma';
import { DEMO_EMAIL } from '../lib/demo';

const COMMIT = process.argv.includes('--commit');

/** From this date to today. Three full years of history to analyse. */
const START = new Date(Date.UTC(2024, 0, 1));

/** Deterministic, so re-seeding gives the same figures rather than new ones. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A dish on the menu. */
interface Dish {
  code: string;
  name: string;
  /** Revenue family, which becomes a Category. */
  familia: string;
  subFamily?: string;
  /** Menu price, VAT included. */
  price: number;
  /**
   * How often it is ordered, relative to its siblings. A real menu is
   * concentrated: a couple of dishes carry the room and the long tail barely
   * moves, which is exactly what the Produtos tab exists to show.
   */
  weight: number;
  /** Portuguese VAT: 13 on food, 23 on drink. */
  vat: 0.13 | 0.23;
  /** Sold from this month index since START, if it is not on the menu yet. */
  from?: number;
  /** Taken off the menu at this month index. */
  until?: number;
}

/**
 * A kitchen-display modifier: rung through at nothing so the pass knows what
 * goes on the plate. These are what the ingredients ranking counts, and they
 * have to behave like the real thing — ordered in quantity, priced at zero.
 */
interface Modifier {
  code: string;
  name: string;
  familia: 'INGREDIENTES' | 'MOLHOS';
  /** Chance that a given main course carries it. */
  rate: number;
}

// ---------------------------------------------------------------- menus

const TASCA_MENU: Dish[] = [
  // The two that carry the room.
  { code: 'T01', name: 'Bacalhau à Brás', familia: 'COMIDAS', subFamily: 'PEIXE', price: 14.5, weight: 100, vat: 0.13 },
  { code: 'T02', name: 'Polvo à Lagareiro', familia: 'COMIDAS', subFamily: 'PEIXE', price: 18.9, weight: 82, vat: 0.13 },
  { code: 'T03', name: 'Bife à Portuguesa', familia: 'COMIDAS', subFamily: 'CARNE', price: 15.5, weight: 68, vat: 0.13 },
  { code: 'T04', name: 'Arroz de Pato', familia: 'COMIDAS', subFamily: 'CARNE', price: 13.9, weight: 54, vat: 0.13 },
  { code: 'T05', name: 'Sardinhas Assadas', familia: 'COMIDAS', subFamily: 'PEIXE', price: 12.5, weight: 40, vat: 0.13 },
  { code: 'T06', name: 'Febras com Batata Frita', familia: 'COMIDAS', subFamily: 'CARNE', price: 11.5, weight: 36, vat: 0.13 },
  { code: 'T07', name: 'Bacalhau com Natas', familia: 'COMIDAS', subFamily: 'PEIXE', price: 14.9, weight: 30, vat: 0.13 },
  // A dish that arrives mid-2025 and does well — something for the charts.
  { code: 'T08', name: 'Açorda de Marisco', familia: 'COMIDAS', subFamily: 'PEIXE', price: 16.9, weight: 34, vat: 0.13, from: 18 },
  // And one that comes off the menu, so a product can be seen to stop.
  { code: 'T09', name: 'Feijoada à Transmontana', familia: 'COMIDAS', subFamily: 'CARNE', price: 13.5, weight: 22, vat: 0.13, until: 20 },

  { code: 'T20', name: 'Sopa do Dia', familia: 'ENTRADAS', price: 3.2, weight: 46, vat: 0.13 },
  { code: 'T21', name: 'Pão e Azeitonas', familia: 'ENTRADAS', price: 2.5, weight: 74, vat: 0.13 },
  { code: 'T22', name: 'Queijo da Serra', familia: 'ENTRADAS', price: 7.5, weight: 24, vat: 0.13 },
  { code: 'T23', name: 'Peixinhos da Horta', familia: 'ENTRADAS', price: 6.9, weight: 30, vat: 0.13 },

  { code: 'T40', name: 'Vinho da Casa (jarro)', familia: 'BEBIDAS', subFamily: 'VINHOS', price: 7.5, weight: 76, vat: 0.23 },
  { code: 'T41', name: 'Água 50cl', familia: 'BEBIDAS', subFamily: 'AGUAS', price: 1.8, weight: 72, vat: 0.23 },
  { code: 'T42', name: 'Super Bock', familia: 'BEBIDAS', subFamily: 'CERVEJAS', price: 2.2, weight: 48, vat: 0.23 },
  { code: 'T43', name: 'Coca-Cola', familia: 'BEBIDAS', subFamily: 'REFRIGERANTES', price: 2.4, weight: 52, vat: 0.23 },
  { code: 'T44', name: 'Vinho Alentejano (garrafa)', familia: 'BEBIDAS', subFamily: 'VINHOS', price: 16.5, weight: 20, vat: 0.23 },

  { code: 'T60', name: 'Pastel de Nata', familia: 'SOBREMESAS', price: 1.6, weight: 40, vat: 0.13 },
  { code: 'T61', name: 'Arroz Doce', familia: 'SOBREMESAS', price: 3.5, weight: 40, vat: 0.13 },
  { code: 'T62', name: 'Mousse de Chocolate', familia: 'SOBREMESAS', price: 3.8, weight: 36, vat: 0.13 },
  { code: 'T63', name: 'Baba de Camelo', familia: 'SOBREMESAS', price: 3.5, weight: 18, vat: 0.13 },

  { code: 'T80', name: 'Café', familia: 'CAFETARIA', price: 0.9, weight: 68, vat: 0.23 },
  { code: 'T81', name: 'Galão', familia: 'CAFETARIA', price: 1.4, weight: 22, vat: 0.23 },
  { code: 'T82', name: 'Aguardente', familia: 'CAFETARIA', price: 2.5, weight: 26, vat: 0.23 },
];

const TASCA_MODIFIERS: Modifier[] = [
  { code: 'TI1', name: 'Batata Frita', familia: 'INGREDIENTES', rate: 0.42 },
  { code: 'TI2', name: 'Arroz Branco', familia: 'INGREDIENTES', rate: 0.35 },
  { code: 'TI3', name: 'Salada Mista', familia: 'INGREDIENTES', rate: 0.3 },
  { code: 'TI4', name: 'Batata Cozida', familia: 'INGREDIENTES', rate: 0.26 },
  { code: 'TI5', name: 'Grelos Salteados', familia: 'INGREDIENTES', rate: 0.18 },
  { code: 'TI6', name: 'Ovo Estrelado', familia: 'INGREDIENTES', rate: 0.12 },
  { code: 'TI7', name: 'Presunto', familia: 'INGREDIENTES', rate: 0.07 },
  { code: 'TM1', name: 'Azeite e Alho', familia: 'MOLHOS', rate: 0.33 },
  { code: 'TM2', name: 'Piri-Piri', familia: 'MOLHOS', rate: 0.22 },
  { code: 'TM3', name: 'Maionese', familia: 'MOLHOS', rate: 0.15 },
  { code: 'TM4', name: 'Molho Tártaro', familia: 'MOLHOS', rate: 0.09 },
];

const SUSHI_MENU: Dish[] = [
  { code: 'S01', name: 'Combinado Sushi 20 peças', familia: 'SUSHI', subFamily: 'COMBINADOS', price: 28.5, weight: 100, vat: 0.13 },
  { code: 'S02', name: 'Combinado Sushi 40 peças', familia: 'SUSHI', subFamily: 'COMBINADOS', price: 52.0, weight: 46, vat: 0.13 },
  { code: 'S03', name: 'Salmão Nigiri (2 un)', familia: 'SUSHI', subFamily: 'NIGIRI', price: 4.8, weight: 88, vat: 0.13 },
  { code: 'S04', name: 'Atum Nigiri (2 un)', familia: 'SUSHI', subFamily: 'NIGIRI', price: 5.4, weight: 54, vat: 0.13 },
  { code: 'S05', name: 'California Roll (8 un)', familia: 'SUSHI', subFamily: 'ROLLS', price: 9.5, weight: 76, vat: 0.13 },
  { code: 'S06', name: 'Salmon Roll (8 un)', familia: 'SUSHI', subFamily: 'ROLLS', price: 10.5, weight: 62, vat: 0.13 },
  { code: 'S07', name: 'Sashimi Salmão (9 un)', familia: 'SUSHI', subFamily: 'SASHIMI', price: 13.9, weight: 44, vat: 0.13 },
  { code: 'S08', name: 'Temaki Salmão', familia: 'SUSHI', subFamily: 'TEMAKI', price: 7.5, weight: 38, vat: 0.13 },
  // Poké arrives in 2025 and takes off — the clearest story in the charts.
  { code: 'S09', name: 'Poké Bowl Salmão', familia: 'POKE', price: 12.9, weight: 70, vat: 0.13, from: 14 },
  { code: 'S10', name: 'Poké Bowl Atum', familia: 'POKE', price: 13.9, weight: 40, vat: 0.13, from: 14 },

  { code: 'S20', name: 'Gyoza (5 un)', familia: 'ENTRADAS', price: 6.5, weight: 64, vat: 0.13 },
  { code: 'S21', name: 'Edamame', familia: 'ENTRADAS', price: 4.5, weight: 58, vat: 0.13 },
  { code: 'S22', name: 'Sopa Miso', familia: 'ENTRADAS', price: 3.5, weight: 72, vat: 0.13 },
  { code: 'S23', name: 'Algas Wakame', familia: 'ENTRADAS', price: 5.5, weight: 30, vat: 0.13 },

  { code: 'S30', name: 'Ramen Tonkotsu', familia: 'QUENTES', price: 13.5, weight: 52, vat: 0.13 },
  { code: 'S31', name: 'Yakisoba Frango', familia: 'QUENTES', price: 11.9, weight: 36, vat: 0.13 },
  { code: 'S32', name: 'Tempura Mista', familia: 'QUENTES', price: 10.5, weight: 34, vat: 0.13 },

  { code: 'S40', name: 'Água 50cl', familia: 'BEBIDAS', subFamily: 'AGUAS', price: 2.0, weight: 68, vat: 0.23 },
  { code: 'S41', name: 'Cerveja Sapporo', familia: 'BEBIDAS', subFamily: 'CERVEJAS', price: 4.5, weight: 56, vat: 0.23 },
  { code: 'S42', name: 'Chá Verde', familia: 'BEBIDAS', subFamily: 'CHAS', price: 2.8, weight: 48, vat: 0.23 },
  { code: 'S43', name: 'Saqué (copo)', familia: 'BEBIDAS', subFamily: 'ALCOOL', price: 6.5, weight: 24, vat: 0.23 },
  { code: 'S44', name: 'Coca-Cola', familia: 'BEBIDAS', subFamily: 'REFRIGERANTES', price: 2.5, weight: 44, vat: 0.23 },

  { code: 'S60', name: 'Mochi (2 un)', familia: 'SOBREMESAS', price: 4.5, weight: 40, vat: 0.13 },
  { code: 'S61', name: 'Cheesecake Matcha', familia: 'SOBREMESAS', price: 5.2, weight: 30, vat: 0.13 },
  { code: 'S62', name: 'Gelado de Gengibre', familia: 'SOBREMESAS', price: 4.0, weight: 18, vat: 0.13 },
];

const SUSHI_MODIFIERS: Modifier[] = [
  { code: 'SI1', name: 'Gengibre', familia: 'INGREDIENTES', rate: 0.68 },
  { code: 'SI2', name: 'Wasabi', familia: 'INGREDIENTES', rate: 0.6 },
  { code: 'SI3', name: 'Abacate Extra', familia: 'INGREDIENTES', rate: 0.24 },
  { code: 'SI4', name: 'Cebolinho', familia: 'INGREDIENTES', rate: 0.2 },
  { code: 'SI5', name: 'Sésamo', familia: 'INGREDIENTES', rate: 0.18 },
  { code: 'SI6', name: 'Queijo Creme', familia: 'INGREDIENTES', rate: 0.14 },
  { code: 'SM1', name: 'Molho de Soja', familia: 'MOLHOS', rate: 0.72 },
  { code: 'SM2', name: 'Molho Teriyaki', familia: 'MOLHOS', rate: 0.26 },
  { code: 'SM3', name: 'Maionese Picante', familia: 'MOLHOS', rate: 0.21 },
  { code: 'SM4', name: 'Molho Ponzu', familia: 'MOLHOS', rate: 0.1 },
];

// ------------------------------------------------------ trading shape

interface Shape {
  /** Covers on a busy Saturday, before season and weekday adjustment. */
  baseCovers: number;
  /** Sun..Sat. Zero closes the day. */
  dayFactor: number[];
  /** Jan..Dec. */
  monthFactor: number[];
  /** Year-on-year growth applied from 2024. */
  growth: Record<number, number>;
  /** Share of takings that leaves the building. */
  takeawayShare: Record<number, number>;
}

/**
 * A tasca: lunch-led, shut Mondays, August dips when the city empties.
 *
 * `baseCovers` is set so a day lands near the 2 005 EUR this restaurant
 * already averages — the figure `seed-demo.ts` generated and then derived two
 * years of goods and overheads from. Inventing a smaller menu would leave
 * those costs standing against half the revenue, and the demo would open on a
 * restaurant losing money heavily.
 */
const TASCA_SHAPE: Shape = {
  baseCovers: 124,
  dayFactor: [0.74, 0, 0.78, 0.84, 0.95, 1.34, 1.42],
  monthFactor: [0.84, 0.88, 0.96, 1.02, 1.08, 1.12, 1.16, 0.92, 1.04, 1.0, 0.92, 1.14],
  growth: { 2024: 1.0, 2025: 1.06, 2026: 1.13 },
  takeawayShare: { 2024: 0.14, 2025: 0.19, 2026: 0.26 },
};

/**
 * A sushi place: dinner-led, shut Sunday and Monday, and takeaway is a far
 * bigger part of the business than it is for a tasca — which is the point of
 * having two of them.
 */
const SUSHI_SHAPE: Shape = {
  baseCovers: 38,
  dayFactor: [0, 0, 0.72, 0.8, 0.98, 1.44, 1.52],
  monthFactor: [0.88, 0.94, 0.98, 1.02, 1.06, 1.08, 1.04, 0.96, 1.08, 1.04, 0.98, 1.2],
  growth: { 2024: 1.0, 2025: 1.11, 2026: 1.22 },
  takeawayShare: { 2024: 0.3, 2025: 0.36, 2026: 0.41 },
};

interface Spec {
  restaurantId: string;
  label: string;
  menu: Dish[];
  modifiers: Modifier[];
  shape: Shape;
  seed: number;
}

/** Months between START and a date, for the from/until windows. */
function monthsSinceStart(date: Date): number {
  return (date.getUTCFullYear() - START.getUTCFullYear()) * 12 + date.getUTCMonth();
}

function isOnMenu(dish: Dish, monthIndex: number): boolean {
  if (dish.from !== undefined && monthIndex < dish.from) return false;
  if (dish.until !== undefined && monthIndex >= dish.until) return false;
  return true;
}

async function seedRestaurant(spec: Spec, userId: string) {
  const rand = makeRandom(spec.seed);
  const { restaurantId: rid, menu, modifiers, shape } = spec;

  console.log(`\n  ${spec.label}`);

  // --------------------------------------------------- revenue categories
  // Reused where they already exist: a restaurant that has BEBIDAS keeps the
  // one it has rather than gaining a second identical line.
  const familias = [...new Set(menu.map((d) => d.familia))];
  const allFamilias = [...familias, 'INGREDIENTES', 'MOLHOS'];

  const existing = await prisma.category.findMany({
    where: { restaurantId: rid, type: 'REVENUE' },
    select: { id: true, name: true },
  });
  const catByName = new Map(existing.map((c) => [c.name.toUpperCase(), c.id]));

  for (const [i, familia] of allFamilias.entries()) {
    if (catByName.has(familia.toUpperCase())) continue;
    const created = await prisma.category.create({
      data: { restaurantId: rid, type: 'REVENUE', name: familia, sortOrder: i, isActive: true },
      select: { id: true },
    });
    catByName.set(familia.toUpperCase(), created.id);
  }
  console.log(`    ${allFamilias.length} revenue categories`);

  // ------------------------------------------------------------ products
  const productIds = new Map<string, string>();
  const everything = [
    ...menu.map((d) => ({ code: d.code, name: d.name, familia: d.familia, subFamily: d.subFamily ?? null })),
    ...modifiers.map((m) => ({ code: m.code, name: m.name, familia: m.familia, subFamily: null })),
  ];

  for (const p of everything) {
    const saved = await prisma.posProduct.upsert({
      where: { restaurantId_code: { restaurantId: rid, code: p.code } },
      create: {
        restaurantId: rid,
        code: p.code,
        name: p.name,
        categoryId: catByName.get(p.familia.toUpperCase()) ?? null,
        subFamily: p.subFamily,
      },
      update: {
        name: p.name,
        categoryId: catByName.get(p.familia.toUpperCase()) ?? null,
        subFamily: p.subFamily,
      },
      select: { id: true },
    });
    productIds.set(p.code, saved.id);
  }
  console.log(`    ${productIds.size} products (${menu.length} dishes, ${modifiers.length} modifiers)`);

  // ---------------------------------------------------------- the trading
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Days this restaurant already trades on, with the takings already
  // recorded. Where one exists it is the authority: `seed-demo.ts` derived
  // two years of goods and overheads from exactly these numbers, so a menu
  // that came to a different total would leave those costs standing against
  // revenue that no longer exists — and the demo would open on a restaurant
  // apparently losing money badly.
  const recorded = await prisma.dailySummary.findMany({
    where: { restaurantId: rid, deletedAt: null, date: { gte: START } },
    select: { date: true, revenueTotal: true, dineInTickets: true, takeawayTickets: true },
  });
  const recordedByDate = new Map(
    recorded.map((r) => [
      r.date.toISOString().slice(0, 10),
      { revenue: Number(r.revenueTotal), covers: r.dineInTickets + r.takeawayTickets },
    ]),
  );
  if (recordedByDate.size) {
    console.log(`    ${recordedByDate.size} days already recorded — the menu is fitted to those takings`);
  }

  const sales: Array<{ date: Date; productId: string; quantity: number; revenue: number; revenueNet: number }> = [];
  const categoryRevenue = new Map<string, { date: Date; categoryId: string; revenue: number; revenueNet: number; quantity: number }>();
  const summaries: Array<{ date: Date; dineIn: number; takeaway: number; total: number; dineInTickets: number; takeawayTickets: number }> = [];

  for (let d = new Date(START); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = new Date(d);
    const iso = date.toISOString().slice(0, 10);
    const already = recordedByDate.get(iso);
    const dow = date.getUTCDay();
    const dayFactor = shape.dayFactor[dow];

    // A day the money seeder recorded is a day this restaurant traded, even
    // if this script's own weekday pattern would have closed it. Its absence
    // from that set, on a day the pattern closes, is a closure.
    if (!already && dayFactor === 0) continue;

    const monthIndex = monthsSinceStart(date);
    const growth = shape.growth[date.getUTCFullYear()] ?? 1;
    const season = shape.monthFactor[date.getUTCMonth()];
    const noise = 0.86 + rand() * 0.28;

    const covers = already
      ? Math.max(4, already.covers)
      : Math.max(4, Math.round(shape.baseCovers * dayFactor * season * growth * noise));

    const onMenu = menu.filter((dish) => isOnMenu(dish, monthIndex));
    const mains = onMenu.filter((dish) => ['COMIDAS', 'SUSHI', 'POKE', 'QUENTES'].includes(dish.familia));
    const weightTotal = onMenu.reduce((s, dish) => s + dish.weight, 0);

    let dayRevenue = 0;
    let mainsSold = 0;

    // Each cover orders roughly 2.4 items across the menu. Where the day's
    // takings are already recorded, that figure is scaled to land on them:
    // one pass works out what this mix would come to per cover, and the
    // second multiplies by whatever makes the total right. Without it the
    // menu would drift from the revenue the costs were derived from.
    let fit = 1;
    if (already) {
      const perCover = onMenu.reduce(
        (s, dish) => s + (2.4 * dish.weight * dish.price) / weightTotal,
        0,
      );
      if (perCover > 0) fit = already.revenue / (covers * perCover);
    }

    // Dearest first. Rounding to whole portions leaves an error worth up to
    // half a dish on every line, and on a quiet day with a long menu that
    // came to 13% of the takings. Working down the price list and refitting
    // as it goes means the expensive dishes land first, and the cheap ones —
    // a coffee, a water — absorb what is left, where a portion either way is
    // worth cents rather than euros.
    const ordered = [...onMenu].sort((a, b) => b.price - a.price);
    let remaining = already ? already.revenue : 0;
    let placed = 0;

    for (const dish of ordered) {
      // A dish's share of the order is its weight, plus noise so no two days
      // are identical.
      const expected = (covers * 2.4 * fit * dish.weight) / weightTotal;
      let wanted = expected * (0.72 + rand() * 0.56);

      if (already) {
        // What is still to be sold, spread over the dishes not yet placed.
        // This is the figure, not a hint: the day has to come to what the
        // till says it came to. The day-to-day irregularity is already in
        // `covers` and in the weights, so there is nothing to protect by
        // blending the noise back in here — and doing so pulled the year
        // several percent under the recorded takings.
        //
        // Shares are of *spend*, not of portions. Weighting by portions
        // treated a 0,90 EUR coffee and a 14,50 EUR main as comparable, so
        // closing the gap fell on whatever was cheapest: the tasca ended up
        // selling 220 coffees a day to 107 covers, while the mains sat under
        // twelve. Multiplying the weight by the price asks the right
        // question — how much of the day's money is this dish — and the
        // volumes come out as a real service.
        const spendLeft = ordered.slice(placed).reduce((s, x) => s + x.weight * x.price, 0);
        if (spendLeft > 0 && remaining > 0) {
          const target = (remaining * dish.weight * dish.price) / spendLeft / dish.price;
          wanted = target * (0.88 + rand() * 0.24);
        } else {
          wanted = 0;
        }

        // However the fit lands, a dish cannot stray far from what the menu
        // mix says it should be. Without the ceiling a rounding gap on a
        // quiet day gets dumped on one line.
        wanted = Math.min(wanted, expected * 1.8);
      }
      placed++;

      const quantity = Math.max(0, Math.round(wanted));
      if (already) remaining -= quantity * dish.price;
      if (quantity <= 0) continue;

      const revenue = round2(quantity * dish.price);
      const revenueNet = round2(revenue / (1 + dish.vat));

      sales.push({ date, productId: productIds.get(dish.code)!, quantity, revenue, revenueNet });
      dayRevenue += revenue;
      if (mains.includes(dish)) mainsSold += quantity;

      const catId = catByName.get(dish.familia.toUpperCase())!;
      const key = `${date.toISOString().slice(0, 10)}|${catId}`;
      const agg = categoryRevenue.get(key);
      if (agg) {
        agg.revenue += revenue;
        agg.revenueNet += revenueNet;
        agg.quantity += quantity;
      } else {
        categoryRevenue.set(key, { date, categoryId: catId, revenue, revenueNet, quantity });
      }
    }

    // Modifiers ride on the main courses, at no charge. This is what makes
    // the ingredients ranking real: high volume, zero money.
    for (const mod of modifiers) {
      const quantity = Math.round(mainsSold * mod.rate * (0.78 + rand() * 0.44));
      if (quantity <= 0) continue;

      sales.push({ date, productId: productIds.get(mod.code)!, quantity, revenue: 0, revenueNet: 0 });

      const catId = catByName.get(mod.familia)!;
      const key = `${date.toISOString().slice(0, 10)}|${catId}`;
      const agg = categoryRevenue.get(key);
      if (agg) agg.quantity += quantity;
      else categoryRevenue.set(key, { date, categoryId: catId, revenue: 0, revenueNet: 0, quantity });
    }

    // A recorded day keeps its own summary untouched: the goods and
    // overheads for it were worked out from those exact figures, and the
    // rounding drift of a per-dish mix must not move them.
    if (already) continue;

    const takeawayShare = shape.takeawayShare[date.getUTCFullYear()] ?? 0.2;
    const takeaway = round2(dayRevenue * takeawayShare);
    const dineIn = round2(dayRevenue - takeaway);

    summaries.push({
      date,
      dineIn,
      takeaway,
      total: round2(dayRevenue),
      dineInTickets: Math.max(1, Math.round(covers * (1 - takeawayShare))),
      takeawayTickets: Math.max(1, Math.round((takeaway / dayRevenue) * covers * 1.4)),
    });
  }

  // Reported from the sales themselves rather than from `summaries`, which
  // now holds only the days this script adds — the recorded ones keep the
  // summary they already had.
  const byDay = new Map<string, number>();
  for (const s of sales) {
    const key = s.date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + s.revenue);
  }
  const totalRevenue = [...byDay.values()].reduce((a, b) => a + b, 0);

  console.log(`    ${byDay.size} trading days, ${sales.length} sale rows`);
  console.log(`    ${summaries.length} new summaries, ${byDay.size - summaries.length} days left as recorded`);
  console.log(`    revenue ${totalRevenue.toFixed(2)} EUR over ${START.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}`);

  for (const year of [2024, 2025, 2026]) {
    const days = [...byDay.entries()].filter(([k]) => k.startsWith(String(year)));
    if (days.length) {
      console.log(`      ${year}: ${days.length} days, ${days.reduce((s, [, v]) => s + v, 0).toFixed(2)} EUR`);
    }
  }

  // The menu must come to what the day actually took, or the P&L stops
  // tying out against costs derived from those takings.
  let worstDrift = 0;
  for (const [iso, revenue] of byDay) {
    const r = recordedByDate.get(iso);
    if (!r || r.revenue === 0) continue;
    worstDrift = Math.max(worstDrift, Math.abs(revenue - r.revenue) / r.revenue);
  }
  if (recordedByDate.size) {
    console.log(`    worst day drift against recorded takings: ${(worstDrift * 100).toFixed(1)}%`);
  }

  // Does the service look like a real one? Nobody drinks two coffees per
  // cover, and an owner shown 220 of them against 107 covers stops believing
  // the rest of the screen. An earlier version did exactly that, because the
  // fit closed its gap on whatever was cheapest.
  const tradingDays = byDay.size;
  const covers = summaries.reduce((s, x) => s + x.dineInTickets + x.takeawayTickets, 0)
    + [...recordedByDate.values()].reduce((s, r) => s + r.covers, 0);
  const perDayCovers = covers / tradingDays;

  const qtyByCode = new Map<string, number>();
  for (const s of sales) qtyByCode.set(s.productId, (qtyByCode.get(s.productId) ?? 0) + s.quantity);

  const idToDish = new Map(menu.map((d) => [productIds.get(d.code)!, d]));
  const worst = [...qtyByCode.entries()]
    .filter(([id]) => idToDish.has(id))
    .map(([id, q]) => ({ dish: idToDish.get(id)!, perCover: q / tradingDays / perDayCovers }))
    .sort((a, b) => b.perCover - a.perCover)[0];

  if (worst) {
    const flag = worst.perCover > 1.1 ? '  <-- IMPLAUSIBLE' : '';
    console.log(
      `    busiest line: ${worst.dish.name} at ${worst.perCover.toFixed(2)} per cover ` +
        `(${perDayCovers.toFixed(0)} covers/day)${flag}`,
    );
  }

  // Reported either way, so a dry run shows what the margins would become.
  await seedCostsForUncoveredDays(spec, userId, byDay, rand);

  if (!COMMIT) return;

  // ---------------------------------------------------------------- write
  // Only the generated range is cleared, so a re-run corrects rather than
  // doubles, and nothing outside it is touched.
  const range = { gte: START, lte: end };
  await prisma.posProductSale.deleteMany({ where: { restaurantId: rid, date: range } });
  await prisma.dailyCategoryRevenue.deleteMany({ where: { restaurantId: rid, date: range } });

  // In chunks: a three-year run is tens of thousands of rows and one
  // statement that size is refused.
  const CHUNK = 2000;
  for (let i = 0; i < sales.length; i += CHUNK) {
    await prisma.posProductSale.createMany({
      data: sales.slice(i, i + CHUNK).map((s) => ({
        restaurantId: rid,
        productId: s.productId,
        date: s.date,
        quantity: s.quantity,
        revenue: s.revenue,
        revenueNet: s.revenueNet,
      })),
    });
  }

  const catRows = [...categoryRevenue.values()];
  for (let i = 0; i < catRows.length; i += CHUNK) {
    await prisma.dailyCategoryRevenue.createMany({
      data: catRows.slice(i, i + CHUNK).map((c) => ({
        restaurantId: rid,
        date: c.date,
        categoryId: c.categoryId,
        revenue: round2(c.revenue),
        revenueNet: round2(c.revenueNet),
        quantity: c.quantity,
      })),
    });
  }

  // The day's total. Upserted one at a time because the money seeder may
  // already have written some of these days, and its figures are the ones
  // the costs were derived from — but outside its range this is the only
  // source, so the day must exist.
  for (const s of summaries) {
    await prisma.dailySummary.upsert({
      where: { restaurantId_date: { restaurantId: rid, date: s.date } },
      create: {
        restaurantId: rid,
        date: s.date,
        createdById: userId,
        dineInRevenue: s.dineIn,
        takeawayRevenue: s.takeaway,
        revenueTotal: s.total,
        dineInTickets: s.dineInTickets,
        takeawayTickets: s.takeawayTickets,
      },
      update: {
        dineInRevenue: s.dineIn,
        takeawayRevenue: s.takeaway,
        revenueTotal: s.total,
        dineInTickets: s.dineInTickets,
        takeawayTickets: s.takeawayTickets,
        deletedAt: null,
      },
    });
  }

  console.log(`    written: ${sales.length} sales, ${catRows.length} category rows, ${summaries.length} summaries`);

}

/**
 * Goods and overheads for any day that has takings but no costs.
 *
 * `seed-demo.ts` costed one restaurant over one stretch. Everything this
 * script adds outside it — 2024 for the tasca, the whole of the Japanese
 * place — would otherwise show revenue against nothing, and a demo opening on
 * a 100% profit margin is worse than useless: it is the one number an owner
 * knows on sight to be false.
 *
 * Only the gap is filled. Days already costed keep what they have, because
 * those figures carry the deliberate story the demo exists to tell — food
 * cost drifting above its band through 2026.
 */
async function seedCostsForUncoveredDays(
  spec: Spec,
  userId: string,
  revenueByDay: Map<string, number>,
  rand: () => number,
) {
  const rid = spec.restaurantId;

  const costCats = await prisma.category.findMany({
    where: { restaurantId: rid, type: { in: ['COGS', 'OPEX'] }, isActive: true },
    select: { id: true, name: true, type: true, isLabour: true },
  });
  const cogs = costCats.filter((c) => c.type === 'COGS');
  const opex = costCats.filter((c) => c.type === 'OPEX');
  if (!cogs.length || !opex.length) {
    console.log('    no cost categories — skipping costs');
    return;
  }

  // Months that already carry costs are left entirely alone: part-costing a
  // month would read as a sudden collapse in food cost.
  const costed = await prisma.costEntry.findMany({
    where: { restaurantId: rid, deletedAt: null },
    select: { date: true },
  });
  const costedMonths = new Set(
    costed.map((c) => `${c.date.getUTCFullYear()}-${c.date.getUTCMonth()}`),
  );

  // Revenue per month, from what was actually sold.
  const monthRevenue = new Map<string, number>();
  for (const [iso, revenue] of revenueByDay) {
    const [y, m] = iso.split('-').map(Number);
    const key = `${y}-${m - 1}`;
    monthRevenue.set(key, (monthRevenue.get(key) ?? 0) + revenue);
  }

  const rows: Array<{
    restaurantId: string; date: Date; type: 'COGS' | 'OPEX';
    categoryId: string; amount: number; description: string; createdById: string;
  }> = [];

  for (const [key, revenue] of monthRevenue) {
    if (costedMonths.has(key) || revenue <= 0) continue;
    const [year, month] = key.split('-').map(Number);

    // Goods land on deliveries through the month, overheads on its last day
    // — the shape an owner actually enters.
    const foodCost = 0.3 + rand() * 0.02;
    const totalCogs = revenue * foodCost;
    const deliveries = 8;

    for (let i = 0; i < deliveries; i++) {
      const day = Math.min(28, 2 + Math.round((i * 26) / deliveries));
      const date = new Date(Date.UTC(year, month, day));
      for (const cat of cogs) {
        const amount = round2((totalCogs / deliveries / cogs.length) * (0.78 + rand() * 0.44));
        if (amount < 1) continue;
        rows.push({
          restaurantId: rid, date, type: 'COGS', categoryId: cat.id, amount,
          description: `Entrega ${cat.name.toLowerCase()}`, createdById: userId,
        });
      }
    }

    // Overheads at 56% of takings, which with ~31% goods leaves a net margin
    // near 13% — inside the healthy band, so the demo opens on a restaurant
    // that works.
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const today = new Date();
    const postingDate = lastDay > today ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) : lastDay;
    const totalOpex = revenue * 0.56;

    // Labour is the bulk of it; the rest split across what is left.
    const labour = opex.filter((c) => c.isLabour);
    const other = opex.filter((c) => !c.isLabour);

    for (const cat of labour) {
      const amount = round2((totalOpex * 0.54) / Math.max(1, labour.length));
      if (amount >= 1) {
        rows.push({ restaurantId: rid, date: postingDate, type: 'OPEX', categoryId: cat.id, amount, description: cat.name, createdById: userId });
      }
    }
    for (const cat of other) {
      const amount = round2((totalOpex * 0.46) / Math.max(1, other.length) * (0.82 + rand() * 0.36));
      if (amount >= 1) {
        rows.push({ restaurantId: rid, date: postingDate, type: 'OPEX', categoryId: cat.id, amount, description: cat.name, createdById: userId });
      }
    }
  }

  const uncosted = [...monthRevenue.keys()].filter((k) => !costedMonths.has(k));
  if (!rows.length) {
    console.log('    every month already costed');
    return;
  }

  const addedCogs = rows.filter((r) => r.type === 'COGS').reduce((s, r) => s + r.amount, 0);
  const addedOpex = rows.filter((r) => r.type === 'OPEX').reduce((s, r) => s + r.amount, 0);
  const addedRevenue = uncosted.reduce((s, k) => s + (monthRevenue.get(k) ?? 0), 0);
  const margin = addedRevenue > 0 ? ((addedRevenue - addedCogs - addedOpex) / addedRevenue) * 100 : 0;
  console.log(
    `    ${rows.length} cost entries for ${uncosted.length} uncosted months ` +
      `(goods ${((addedCogs / addedRevenue) * 100).toFixed(1)}%, net margin ${margin.toFixed(1)}%)`,
  );

  if (!COMMIT) return;

  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.costEntry.createMany({ data: rows.slice(i, i + CHUNK) });
  }
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });
  if (!user) throw new Error(`No demo user ${DEMO_EMAIL}. Run seed-demo.ts first.`);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, role: 'OWNER' },
    select: { restaurant: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (memberships.length < 2) {
    throw new Error(`Expected two demo restaurants, found ${memberships.length}.`);
  }

  // Oldest is the tasca, the second is the Japanese place.
  const [tasca, sushi] = memberships.map((m) => m.restaurant);

  console.log(`  Demo account: ${DEMO_EMAIL}`);
  console.log(`  ${COMMIT ? 'WRITING' : 'DRY RUN — pass --commit to write'}`);

  await seedRestaurant(
    { restaurantId: tasca.id, label: `${tasca.name} — tasca portuguesa`, menu: TASCA_MENU, modifiers: TASCA_MODIFIERS, shape: TASCA_SHAPE, seed: 20260101 },
    user.id,
  );

  await seedRestaurant(
    { restaurantId: sushi.id, label: `${sushi.name} — japonês`, menu: SUSHI_MENU, modifiers: SUSHI_MODIFIERS, shape: SUSHI_SHAPE, seed: 20260202 },
    user.id,
  );

  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
