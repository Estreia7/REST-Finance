/**
 * Creates (or refreshes) the demo restaurant.
 *
 * A permanently available client account for checking the owner-facing side
 * without touching a real customer's data. The admin console can sign in as
 * this account with one click; that shortcut is hard-wired to this email, so
 * it can never be pointed at a paying client.
 *
 * The data is deliberately not perfect. It carries the problems the product
 * exists to surface: food cost drifting above its healthy band, a supplier
 * putting prices up mid-2026, and the seasonal swing every restaurant has.
 * A demo where everything is green would show none of that.
 *
 * Usage:  npx ts-node scripts/seed-demo.ts
 * Safe to re-run: existing demo data is replaced, nothing else is touched.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

export const DEMO_EMAIL = 'demo@rest-finance.com';
const DEMO_RESTAURANT = 'Tasca da Praça (demonstração)';

/** Deterministic pseudo-random, so re-seeding produces the same figures. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rand = makeRandom(20260912);

/** Seasonality: quiet January, busy summer, strong December. */
const MONTH_FACTOR = [0.82, 0.85, 0.94, 1.0, 1.06, 1.14, 1.22, 1.24, 1.08, 0.98, 0.9, 1.12];

/** Weekday pattern: closed Monday, weekends carry the week. */
const DAY_FACTOR = [0.78, 0, 0.72, 0.8, 0.92, 1.38, 1.45]; // Sun..Sat

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log('  Seeding demo restaurant...\n');

  // ------------------------------------------------------------ account
  const passwordHash = await bcrypt.hash('demo-restaurant-2026', 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: 'Sofia Marques',
      passwordHash,
      emailVerified: new Date(),
    },
    update: { name: 'Sofia Marques', passwordHash },
  });

  let restaurant = await prisma.restaurant.findFirst({
    where: { memberships: { some: { userId: user.id, role: 'OWNER' } } },
  });

  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: DEMO_RESTAURANT,
        plan: 'TRIAL',
        // Far enough out that the demo never shows an expiry warning.
        trialEndsAt: new Date('2027-12-31'),
        monthlyRevenueTarget: 52000,
        seats: 48,
        serviceHoursPerDay: 9,
        onboardingCompleted: true,
      },
    });

    await prisma.membership.create({
      data: {
        userId: user.id,
        restaurantId: restaurant.id,
        role: 'OWNER',
        active: true,
      },
    });
  }

  const rid = restaurant.id;
  console.log(`  Restaurant: ${restaurant.name}`);

  // ----------------------------------------------------------- reset
  // Re-runnable: clear this restaurant's generated data, nothing else.
  await prisma.invoiceItem.deleteMany({ where: { restaurantId: rid } });
  await prisma.costEntry.deleteMany({ where: { restaurantId: rid } });
  await prisma.dailySummary.deleteMany({ where: { restaurantId: rid } });
  await prisma.category.deleteMany({ where: { restaurantId: rid } });
  await prisma.vendor.deleteMany({ where: { restaurantId: rid } });

  // ------------------------------------------------------- categories
  const categorySpec = [
    { name: 'Peixe e marisco', type: 'COGS' as const, isLabour: false, share: 0.3 },
    { name: 'Carne', type: 'COGS' as const, isLabour: false, share: 0.24 },
    { name: 'Hortofrutícolas', type: 'COGS' as const, isLabour: false, share: 0.16 },
    { name: 'Mercearia', type: 'COGS' as const, isLabour: false, share: 0.16 },
    { name: 'Bebidas', type: 'COGS' as const, isLabour: false, share: 0.14 },
    { name: 'Ordenados', type: 'OPEX' as const, isLabour: true, share: 0.437 },
    { name: 'Segurança Social', type: 'OPEX' as const, isLabour: true, share: 0.097 },
    { name: 'Renda', type: 'OPEX' as const, isLabour: false, share: 0.196 },
    { name: 'Eletricidade e água', type: 'OPEX' as const, isLabour: false, share: 0.116 },
    { name: 'Manutenção e seguros', type: 'OPEX' as const, isLabour: false, share: 0.089 },
    { name: 'Outros', type: 'OPEX' as const, isLabour: false, share: 0.065 },
  ];

  const categories = await Promise.all(
    categorySpec.map((c, i) =>
      prisma.category.create({
        data: {
          restaurantId: rid,
          name: c.name,
          type: c.type,
          isLabour: c.isLabour,
          sortOrder: i,
          isActive: true,
        },
      })
    )
  );

  const catByName = new Map(categories.map((c) => [c.name, c]));
  const cogsSpec = categorySpec.filter((c) => c.type === 'COGS');
  const opexSpec = categorySpec.filter((c) => c.type === 'OPEX');

  // ---------------------------------------------------------- vendors
  const vendorNames = [
    'Peixaria Atlântico',
    'Talho Central',
    'Hortas do Oeste',
    'Distribuições Ribeiro',
  ];
  const vendors = await Promise.all(
    vendorNames.map((name) =>
      prisma.vendor.create({ data: { restaurantId: rid, name, isActive: true } })
    )
  );

  // ------------------------------------------------------ daily data
  const start = new Date(2025, 0, 1);
  const today = new Date();
  const end = today < new Date(2026, 11, 31) ? today : new Date(2026, 11, 31);

  const summaries: any[] = [];
  const costs: any[] = [];
  const invoiceItems: any[] = [];

  // Base takings on a Saturday, before seasonal and weekday adjustment.
  const BASE = 1850;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const dow = date.getDay();
    const dayFactor = DAY_FACTOR[dow];

    // Closed Mondays: no row at all, which is what a real owner would enter.
    if (dayFactor === 0) continue;

    // Year-on-year growth, so 2026 comparisons have something to show.
    const yearFactor = date.getFullYear() === 2026 ? 1.09 : 1;
    const monthFactor = MONTH_FACTOR[date.getMonth()];
    const noise = 0.88 + rand() * 0.24;

    const revenue = BASE * dayFactor * monthFactor * yearFactor * noise;

    // Takeaway grew as a share of the business through 2026.
    const takeawayShare = date.getFullYear() === 2026 ? 0.26 : 0.19;
    const takeaway = revenue * takeawayShare;
    const dineIn = revenue - takeaway;

    const avgDineInTicket = 21 + rand() * 5;
    const avgTakeawayTicket = 14 + rand() * 3;

    summaries.push({
      restaurantId: rid,
      date,
      dineInRevenue: round2(dineIn),
      takeawayRevenue: round2(takeaway),
      revenueTotal: round2(revenue),
      dineInTickets: Math.max(1, Math.round(dineIn / avgDineInTicket)),
      takeawayTickets: Math.max(1, Math.round(takeaway / avgTakeawayTicket)),
      createdById: user.id,
    });
  }

  // ------------------------------------------------------------ costs
  // COGS is entered on delivery days rather than daily, which is how a
  // restaurant actually receives stock.
  for (const summary of summaries) {
    const date: Date = summary.date;
    const dow = date.getDay();
    if (dow !== 2 && dow !== 5) continue; // deliveries Tuesday and Friday

    // Food cost climbs through 2026: the problem the alerts exist to catch.
    const inflation =
      date.getFullYear() === 2026 && date.getMonth() >= 4 ? 1.13 : 1.0;

    // Roughly three days of takings covered per delivery.
    const windowRevenue = Number(summary.revenueTotal) * 3;
    const targetFoodCost = 0.305 * inflation;
    const totalCogs = windowRevenue * targetFoodCost * (0.94 + rand() * 0.12);

    for (const spec of cogsSpec) {
      const amount = round2(totalCogs * spec.share);
      if (amount < 1) continue;

      const category = catByName.get(spec.name)!;
      const vendor = vendors[Math.floor(rand() * vendors.length)];

      costs.push({
        restaurantId: rid,
        date,
        type: 'COGS' as const,
        categoryId: category.id,
        vendorId: vendor.id,
        amount,
        description: `Entrega ${spec.name.toLowerCase()}`,
        createdById: user.id,
      });
    }
  }

  // OPEX lands once a month, on the last day.
  const monthKeys = new Set(
    summaries.map((s) => `${s.date.getFullYear()}-${s.date.getMonth()}`)
  );

  for (const key of monthKeys) {
    const [year, month] = key.split('-').map(Number);
    const monthEnd = new Date(year, month + 1, 0);
    if (monthEnd > end) continue;

    const monthRevenue = summaries
      .filter((s) => s.date.getFullYear() === year && s.date.getMonth() === month)
      .reduce((sum, s) => sum + Number(s.revenueTotal), 0);

    // Labour ~30% of revenue, other opex ~26%. Prime Cost then sits near the
    // top of its healthy band and crosses it when food cost rises in 2026,
    // and net margin lands around 13%, inside the healthy 10-15% band.
    const totalOpex = monthRevenue * 0.56;

    for (const spec of opexSpec) {
      const amount = round2(totalOpex * spec.share);
      if (amount < 1) continue;

      costs.push({
        restaurantId: rid,
        date: monthEnd,
        type: 'OPEX' as const,
        categoryId: catByName.get(spec.name)!.id,
        amount,
        description: spec.name,
        createdById: user.id,
      });
    }
  }

  // ----------------------------------------------- invoice line items
  // A few tracked products so the price-alert panel has real history, with
  // one supplier raising prices in May 2026.
  const products = [
    { name: 'Bacalhau demolhado', unit: 'kg', base: 11.4, vendor: vendors[0] },
    { name: 'Polvo congelado', unit: 'kg', base: 9.8, vendor: vendors[0] },
    { name: 'Novilho vazia', unit: 'kg', base: 14.2, vendor: vendors[1] },
    { name: 'Batata', unit: 'kg', base: 0.92, vendor: vendors[2] },
    { name: 'Azeite virgem extra', unit: 'l', base: 6.4, vendor: vendors[3] },
  ];

  const deliveryDays = summaries.filter((s) => s.date.getDay() === 5);

  for (const delivery of deliveryDays) {
    const date: Date = delivery.date;

    for (const product of products) {
      // A step change in May 2026, then drift, so the alert has a clear cause.
      const stepped =
        date.getFullYear() === 2026 && date.getMonth() >= 4 ? 1.16 : 1.0;
      const drift = 1 + (date.getFullYear() === 2026 ? 0.02 : 0) + rand() * 0.03;
      const unitPrice = round2(product.base * stepped * drift);
      const quantity = round2(4 + rand() * 8);

      invoiceItems.push({
        restaurantId: rid,
        vendorId: product.vendor.id,
        productName: product.name,
        normalizedName: product.name.toLowerCase(),
        quantity,
        unit: product.unit,
        unitPrice,
        totalPrice: round2(quantity * unitPrice),
        invoiceDate: date,
      });
    }
  }

  // ----------------------------------------------------------- write
  await prisma.dailySummary.createMany({ data: summaries });
  await prisma.costEntry.createMany({ data: costs });
  await prisma.invoiceItem.createMany({ data: invoiceItems });

  console.log(`  ${summaries.length} daily summaries`);
  console.log(`  ${costs.length} cost entries`);
  console.log(`  ${invoiceItems.length} invoice line items`);
  console.log(`  ${categories.length} categories, ${vendors.length} vendors`);
  console.log(`\n  Demo account: ${DEMO_EMAIL}`);
  console.log('  Reachable from the admin console, Clientes tab.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
