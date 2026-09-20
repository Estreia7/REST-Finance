/**
 * Gives a ZoneSoft client the revenue categories their POS already uses.
 *
 * A new client arrives with a menu already organised — the till has been
 * grouping sales into famílias for years. Making them re-invent that in this
 * app, or worse, live with generic defaults that do not match what the POS
 * prints, is work for nothing.
 *
 * So the famílias come across as REVENUE categories with the same names. A
 * report from the till and a screen in this app then use the same words,
 * which is the whole point: the owner can check one against the other
 * without translating.
 *
 * ── What this does not do ────────────────────────────────────────────────
 * It does not import the amounts. The "Evolução de Vendas por Família"
 * report carries a value per família per day, and there is nowhere to put
 * that yet: `DailySummary` records a day's revenue split by channel, not by
 * category. Inventing an annual figure per família from a partial reading of
 * a 67-page report would put numbers in a client's books that nobody had
 * checked, which is worse than having no breakdown at all.
 *
 * What is certain, and already imported, is the daily total: the família
 * report sums to exactly the same 60 085,55 EUR as the daily report, so the
 * two agree and the revenue figures already in the app are right.
 *
 * ── Which famílias are sellable ──────────────────────────────────────────
 * Some famílias exist for the till's own bookkeeping rather than for selling:
 * MOLHOS and INGREDIENTES are modifiers attached to a dish, STAFF is what
 * the team ate. They appear in the report with a quantity and almost always
 * a zero value. They are created inactive, so they do not clutter a dropdown
 * the owner uses every day, but they still exist if a figure ever lands
 * against one.
 *
 * Usage:
 *   npx tsx scripts/import-zonesoft-categories.ts --restaurant "<name or id>"
 *   npx tsx scripts/import-zonesoft-categories.ts --restaurant "..." --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CSV = path.join(process.cwd(), 'scripts', 'data', 'familias-zonesoft.csv');

interface Familia {
  name: string;
  /** False for the till's own bookkeeping groups, which are created inactive. */
  sellable: boolean;
  note: string;
}

/**
 * Reads the família list.
 *
 * Hand-rolled rather than a CSV library: the notes contain commas and are
 * therefore quoted, which is the only complication, and adding a dependency
 * for ten rows is not worth it.
 */
function readFamilias(): Familia[] {
  const lines = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/).slice(1);

  return lines.map((line, i) => {
    const match = line.match(/^([^,]+),([^,]+),"(.*)"$/);
    if (!match) throw new Error(`Line ${i + 2} of the família list could not be read: "${line}"`);
    return { name: match[1].trim(), sellable: match[2].trim() === 'sim', note: match[3] };
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

  const familias = readFamilias();
  const restaurant = await resolveRestaurant(needle);

  console.log(`Restaurant : ${restaurant.name} (${restaurant.id})`);
  console.log(`Famílias   : ${familias.length} (${familias.filter((f) => f.sellable).length} sellable)\n`);
  for (const f of familias) {
    console.log(`  ${f.sellable ? '●' : '○'} ${f.name.padEnd(20)} ${f.note}`);
  }

  if (dryRun) {
    console.log('\nDry run: nothing was written.');
    return;
  }

  let created = 0;
  let kept = 0;

  for (const [i, f] of familias.entries()) {
    // Matched by name rather than upserted on a key: a restaurant may already
    // have a category called BEBIDAS, entered by hand, and a second one would
    // split their revenue across two identical-looking lines.
    const existing = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, type: 'REVENUE', name: f.name },
      select: { id: true },
    });

    if (existing) { kept++; continue; }

    await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        type: 'REVENUE',
        name: f.name,
        // Ordered as the till lists them, so the two read alike.
        sortOrder: i,
        isActive: f.sellable,
      },
    });
    created++;
  }

  console.log(`\nWritten: ${created} created, ${kept} already existed.`);
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
