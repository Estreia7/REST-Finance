/**
 * Gives the demo account a second restaurant and a compliance vault.
 *
 * Two things need exercising that a single tidy restaurant cannot show: the
 * restaurant switcher, which renders nothing below two; and the expiry
 * indicator, which needs a document in each state to be worth looking at.
 *
 * So the second restaurant is deliberately the untidy one — a lapsed licence
 * and a policy about to run out — while the first is fully in order and shows
 * the congratulation line. Between them every state on the page is reachable.
 *
 * Re-runnable: it clears only the documents it created.
 */

import { PrismaClient, type ComplianceDocType, type RenewalPeriod } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DEMO_EMAIL = 'demo@rest-finance.com';
const SECOND_RESTAURANT = 'Tasca do Mercado';

// Matches lib/uploads.ts exactly, or the seeded files land where the serving
// route will not look for them.
const STORAGE_ROOT = process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage');

/** Days from today, as a date. */
function inDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * A small valid PDF.
 *
 * The download link has to lead to something openable, and the upload path
 * sniffs magic bytes, so a placeholder has to be a real PDF rather than text
 * with a .pdf name.
 */
function minimalPdf(title: string): Buffer {
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 70>>stream
BT /F1 12 Tf 20 60 Td (${title.replace(/[()\\]/g, '')}) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;
  return Buffer.from(body, 'latin1');
}

type DocSpec = {
  type: ComplianceDocType;
  name: string;
  reference: string;
  renewalPeriod: RenewalPeriod;
  issuedAt: Date;
  expiresAt: Date | null;
};

/** Everything in order: the congratulation line. */
const TIDY: DocSpec[] = [
  {
    type: 'INSURANCE',
    name: 'Seguro de responsabilidade civil',
    reference: 'AP-2026-118804',
    renewalPeriod: 'ANNUAL',
    issuedAt: inDays(-160),
    expiresAt: inDays(205),
  },
  {
    type: 'ASAE_LICENCE',
    name: 'Licença de utilização',
    reference: 'LIC-CM-4471',
    renewalPeriod: 'ANNUAL',
    issuedAt: inDays(-240),
    expiresAt: inDays(125),
  },
  {
    type: 'HACCP',
    name: 'Plano HACCP',
    reference: 'HACCP-2026',
    renewalPeriod: 'NONE',
    issuedAt: inDays(-300),
    expiresAt: null,
  },
  {
    type: 'FIRE_SAFETY',
    name: 'Segurança contra incêndios',
    reference: 'SCIE-88210',
    renewalPeriod: 'ANNUAL',
    issuedAt: inDays(-90),
    expiresAt: inDays(275),
  },
  {
    type: 'PEST_CONTROL',
    name: 'Controlo de pragas',
    reference: 'PR-3391',
    renewalPeriod: 'MONTHLY',
    issuedAt: inDays(-12),
    expiresAt: inDays(18),
  },
];

/** One of each problem state: red, amber, and a required type never uploaded. */
const UNTIDY: DocSpec[] = [
  {
    type: 'INSURANCE',
    name: 'Seguro de responsabilidade civil',
    reference: 'AP-2025-770213',
    renewalPeriod: 'ANNUAL',
    issuedAt: inDays(-380),
    // Red: lapsed a fortnight ago.
    expiresAt: inDays(-14),
  },
  {
    type: 'ASAE_LICENCE',
    name: 'Licença de utilização',
    reference: 'LIC-CM-9920',
    renewalPeriod: 'ANNUAL',
    issuedAt: inDays(-356),
    // Amber: inside the fifteen-day window.
    expiresAt: inDays(9),
  },
  {
    type: 'HACCP',
    name: 'Plano HACCP',
    reference: 'HACCP-2025',
    renewalPeriod: 'NONE',
    issuedAt: inDays(-420),
    expiresAt: null,
  },
  {
    type: 'WASTE_CONTRACT',
    name: 'Contrato de recolha de resíduos',
    reference: 'RES-2026-41',
    renewalPeriod: 'MONTHLY',
    issuedAt: inDays(-20),
    // Amber, and monthly, so the renewal column has something to say.
    expiresAt: inDays(10),
  },
  // FIRE_SAFETY deliberately absent, so the summary reports one missing.
];

/** Writes the placeholder file the same way an upload would, and returns its stored path. */
function writePlaceholder(restaurantId: string, spec: DocSpec): { storedPath: string; size: number } {
  const dir = path.join(STORAGE_ROOT, 'compliance', restaurantId);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  const buffer = minimalPdf(spec.name);
  fs.writeFileSync(path.join(dir, filename), buffer);

  return { storedPath: `compliance/${restaurantId}/${filename}`, size: buffer.length };
}

async function seedVault(restaurantId: string, userId: string, specs: DocSpec[], label: string) {
  await prisma.complianceDoc.deleteMany({ where: { restaurantId } });

  for (const spec of specs) {
    const { storedPath, size } = writePlaceholder(restaurantId, spec);

    await prisma.complianceDoc.create({
      data: {
        restaurantId,
        type: spec.type,
        name: spec.name,
        reference: spec.reference,
        renewalPeriod: spec.renewalPeriod,
        filePath: storedPath,
        mimeType: 'application/pdf',
        sizeBytes: size,
        issuedAt: spec.issuedAt,
        expiresAt: spec.expiresAt,
        uploadedById: userId,
      },
    });
  }

  console.log(`  ${label}: ${specs.length} documents`);
}

async function main() {
  console.log('\n  Seeding compliance and a second restaurant...\n');

  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) throw new Error(`${DEMO_EMAIL} not found. Run seed-demo first.`);

  const first = await prisma.membership.findFirst({
    where: { userId: user.id, role: 'OWNER', active: true },
    orderBy: { createdAt: 'asc' },
    select: { restaurantId: true, restaurant: { select: { name: true } } },
  });
  if (!first) throw new Error('Demo owner has no restaurant.');

  // ------------------------------------------------------- second house
  let second = await prisma.restaurant.findFirst({ where: { name: SECOND_RESTAURANT } });

  if (!second) {
    second = await prisma.restaurant.create({
      data: {
        name: SECOND_RESTAURANT,
        plan: 'TRIAL',
        trialEndsAt: new Date('2027-12-31'),
        monthlyRevenueTarget: 21000,
        seats: 26,
        serviceHoursPerDay: 7,
        onboardingCompleted: true,
      },
    });
    console.log(`  Created ${second.name}`);
  }

  const existingMembership = await prisma.membership.findFirst({
    where: { userId: user.id, restaurantId: second.id },
  });
  if (!existingMembership) {
    await prisma.membership.create({
      data: { userId: user.id, restaurantId: second.id, role: 'OWNER', active: true },
    });
  }

  // ------------------------------------------------------------- vaults
  await seedVault(first.restaurantId, user.id, TIDY, first.restaurant.name);
  await seedVault(second.id, user.id, UNTIDY, second.name);

  console.log(`\n  ${first.restaurant.name} is fully in order.`);
  console.log(`  ${SECOND_RESTAURANT} has one expired, two expiring and one missing.`);
  console.log('  The switcher appears in the sidebar now that there are two.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
