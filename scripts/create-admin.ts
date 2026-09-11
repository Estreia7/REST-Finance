/**
 * Creates (or repairs) the platform admin account.
 *
 * Credentials come from the environment, never from source. Hardcoding an
 * admin login into a repository is how servers get taken over: public repos
 * are scanned continuously, and a known username with a common password is
 * found within days.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<strong>' npx ts-node scripts/create-admin.ts
 *
 * Safe to re-run: an existing account is promoted rather than duplicated, and
 * its password is reset to the supplied one.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const NAME = process.env.ADMIN_NAME ?? 'Administrador';

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    fail(
      'Set ADMIN_EMAIL and ADMIN_PASSWORD.\n\n' +
        "  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npx ts-node scripts/create-admin.ts"
    );
  }

  // ALLOW_WEAK_PASSWORD=1 overrides, so a deliberate choice stays visible in
  // the command that made it rather than being removed from this check, which
  // still protects every account created later.
  const allowWeak = process.env.ALLOW_WEAK_PASSWORD === '1';
  const problems: string[] = [];

  if (PASSWORD.length < 12) {
    problems.push(`only ${PASSWORD.length} characters (12 or more recommended)`);
  }
  const WEAK = ['admin', 'password', '12345', 'qwerty', 'letmein'];
  const matched = WEAK.find((w) => PASSWORD.toLowerCase().includes(w));
  if (matched) {
    problems.push(`contains "${matched}", which is in every credential-stuffing list`);
  }

  if (problems.length > 0) {
    if (!allowWeak) {
      fail(
        'ADMIN_PASSWORD is weak:\n' +
          problems.map((p) => `    - ${p}`).join('\n') +
          '\n\n  Use a stronger one, or set ALLOW_WEAK_PASSWORD=1 to proceed anyway.'
      );
    }
    console.warn('\n  WARNING: proceeding with a weak password.');
    problems.forEach((p) => console.warn(`    - ${p}`));
    console.warn('  Worth changing once the beta clients are onboarded.\n');
  }

  const email = EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: NAME, passwordHash, emailVerified: new Date() },
    update: { name: NAME, passwordHash, emailVerified: new Date() },
  });
  console.log(`  User ${email} ready`);

  // PLATFORM_ADMIN is granted through a membership, so it needs a restaurant
  // to hang off. This one is an administrative container, not a real client.
  let adminRestaurant = await prisma.restaurant.findFirst({
    where: { name: 'REST Finance (plataforma)' },
  });

  if (!adminRestaurant) {
    adminRestaurant = await prisma.restaurant.create({
      data: { name: 'REST Finance (plataforma)', plan: 'TRIAL' },
    });
  }

  await prisma.membership.upsert({
    where: {
      restaurantId_userId: { restaurantId: adminRestaurant.id, userId: user.id },
    },
    create: {
      restaurantId: adminRestaurant.id,
      userId: user.id,
      role: 'PLATFORM_ADMIN',
      active: true,
    },
    update: { role: 'PLATFORM_ADMIN', active: true },
  });

  // Any session opened with a previous password is ended.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`  Granted PLATFORM_ADMIN to ${email}`);
  console.log('\n  Done. Sign in at /login.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
