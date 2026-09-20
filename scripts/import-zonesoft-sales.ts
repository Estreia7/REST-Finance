/**
 * Loads a ZoneSoft "Relatório Diário de Vendas" into a restaurant's revenue.
 *
 * A new client arriving with a year of history should not have to type it in
 * a day at a time, and the POS already prints exactly what is needed. This
 * reads the transcribed report and writes one daily summary per trading day.
 *
 * ── Which column is the revenue ──────────────────────────────────────────
 * The report has both "T. Bruto" and "T. Líquido", and picking the wrong one
 * understates the year by about a seventh. Bruto is the amount with VAT —
 * what came through the till and what the owner thinks of as the day's
 * takings. Líquido is net of VAT, which is the tax base, not revenue.
 * Dividing one by the other across this report gives 1.13–1.16, the blend of
 * Portuguese restaurant rates (13% food, 23% drinks), which confirms it.
 *
 * The rest of the app stores revenue VAT-inclusive, so Bruto is the column
 * that belongs in `dineInRevenue`.
 *
 * ── Why everything is dine-in ────────────────────────────────────────────
 * This client does not do takeaway, and the report has no channel split to
 * take one from. Inventing a division would be worse than none: the P&L
 * would show a takeaway line that never happened. Takeaway stays at zero
 * until the POS reports it separately.
 *
 * ── Re-runnable ──────────────────────────────────────────────────────────
 * Keyed on (restaurant, date), which the schema already makes unique, so a
 * second run corrects the figures rather than doubling the year. It never
 * deletes a day that is not in the file — a day entered by hand since the
 * import is the owner's, not ours to remove.
 *
 * Usage:
 *   npx tsx scripts/import-zonesoft-sales.ts --restaurant "<name or id>"
 *   npx tsx scripts/import-zonesoft-sales.ts --restaurant "..." --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CSV = path.join(process.cwd(), 'scripts', 'data', 'vendas-2025.csv');

interface Row {
  date: Date;
  /** T. Bruto: the day's takings including VAT. */
  revenue: number;
  /** N.º Docs: how many bills were closed. */
  tickets: number;
}

/**
 * Reads the transcribed report.
 *
 * Dates are built in UTC because the column is a calendar day, not a moment:
 * local midnight in Lisbon is the previous day in UTC for part of the year,
 * which would file a Monday's takings under Sunday and move revenue between
 * months at the boundaries.
 */
function readRows(): Row[] {
  const lines = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/).slice(1);

  return lines.map((line, i) => {
    const [dmy, bruto, docs] = line.split(',');
    const [d, m, y] = dmy.split('-').map(Number);

    const revenue = Number(bruto);
    const tickets = Number(docs);

    if (!d || !m || !y || !Number.isFinite(revenue) || !Number.isFinite(tickets)) {
      throw new Error(`Line ${i + 2} of the report could not be read: "${line}"`);
    }

    return { date: new Date(Date.UTC(y, m - 1, d)), revenue, tickets };
  });
}

/** Finds the restaurant by id or by name, and refuses an ambiguous name. */
async function resolveRestaurant(needle: string) {
  const byId = await prisma.restaurant.findUnique({ where: { id: needle } });
  if (byId) return byId;

  const byName = await prisma.restaurant.findMany({
    where: { name: { contains: needle, mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  if (byName.length === 0) throw new Error(`No restaurant matches "${needle}".`);
  if (byName.length > 1) {
    throw new Error(
      `"${needle}" matches ${byName.length} restaurants: ` +
        `${byName.map((r) => `${r.name} (${r.id})`).join(', ')}. Use the id.`,
    );
  }
  return byName[0];
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--restaurant');
  const needle = at >= 0 ? args[at + 1] : undefined;
  const dryRun = args.includes('--dry-run');

  if (!needle) {
    console.error('Usage: --restaurant "<name or id>" [--dry-run]');
    process.exit(1);
  }

  const rows = readRows();
  const restaurant = await resolveRestaurant(needle);

  // The owner is recorded as the author: these are their figures, taken from
  // their own POS report, and a summary has to be attributed to someone.
  const owner = await prisma.membership.findFirst({
    where: { restaurantId: restaurant.id, role: 'OWNER', active: true },
    select: { userId: true },
  });
  if (!owner) throw new Error(`${restaurant.name} has no active owner to attribute this to.`);

  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const tickets = rows.reduce((s, r) => s + r.tickets, 0);

  console.log(`Restaurant : ${restaurant.name} (${restaurant.id})`);
  console.log(`Days       : ${rows.length}`);
  console.log(`Revenue    : ${total.toFixed(2)} EUR  (T. Bruto, VAT included)`);
  console.log(`Tickets    : ${tickets}`);
  console.log(`Range      : ${iso(rows[0].date)} to ${iso(rows[rows.length - 1].date)}`);

  if (dryRun) {
    console.log('\nDry run: nothing was written.');
    return;
  }

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.dailySummary.findUnique({
      where: { restaurantId_date: { restaurantId: restaurant.id, date: row.date } },
      select: { id: true },
    });

    const figures = {
      dineInRevenue: row.revenue,
      takeawayRevenue: 0,
      revenueTotal: row.revenue,
      dineInTickets: row.tickets,
      takeawayTickets: 0,
      notes: 'Importado do Relatório Diário de Vendas (ZoneSoft)',
      // Clears a soft delete, so re-importing a day the owner removed brings
      // it back rather than leaving a row that exists but does not count.
      deletedAt: null,
    };

    if (existing) {
      await prisma.dailySummary.update({ where: { id: existing.id }, data: figures });
      updated++;
    } else {
      await prisma.dailySummary.create({
        data: {
          restaurantId: restaurant.id,
          date: row.date,
          createdById: owner.userId,
          ...figures,
        },
      });
      created++;
    }
  }

  console.log(`\nWritten: ${created} new, ${updated} updated.`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
