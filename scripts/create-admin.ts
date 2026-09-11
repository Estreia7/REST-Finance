/**
 * Creates (or repairs) the platform admin account.
 *
 * Credentials come from the environment, never from source. Hardcoding an
 * admin login into a repository is how servers get taken over: public repos
 * are scanned continuously, and a known username with a common password is
 * found within days. This gives the same convenience without that exposure.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<strong>' npx tsx scripts/create-admin.ts
 *
 * Safe to re-run: if the account exists, it is promoted rather than
 * duplicated, and the password is reset to the supplied one.
 */
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
        "  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npx tsx scripts/create-admin.ts"
    );
  }

  // Short or obvious passwords are the entire reason this script exists.
  if (PASSWORD.length < 12) {
    fail('ADMIN_PASSWORD must be at least 12 characters.');
  }
  const WEAK = ['admin', 'password', '12345', 'qwerty', 'letmein'];
  if (WEAK.some((w) => PASSWORD.toLowerCase().includes(w))) {
    fail(
      'ADMIN_PASSWORD contains a common pattern and would be guessed quickly.\n' +
        '  Use a passphrase or a generated string.'
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------------------------------------------------------------- auth
  let authUserId: string;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (created?.user) {
    authUserId = created.user.id;
    console.log(`  Created auth user ${EMAIL}`);
  } else {
    // Already registered: find them and reset the password to the supplied one.
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) fail(`Could not list users: ${listErr.message}`);

    const existing = list.users.find(
      (u) => u.email?.toLowerCase() === EMAIL.toLowerCase()
    );
    if (!existing) {
      fail(`Could not create the user: ${createErr?.message ?? 'unknown error'}`);
    }

    authUserId = existing.id;
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updateErr) fail(`Could not reset the password: ${updateErr.message}`);
    console.log(`  Auth user ${EMAIL} already existed; password reset`);
  }

  // -------------------------------------------------------------- prisma
  // The app reads roles from its own tables, so the user must exist here too,
  // keyed by the Supabase id.
  await prisma.user.upsert({
    where: { id: authUserId },
    create: { id: authUserId, email: EMAIL, name: NAME },
    update: { email: EMAIL, name: NAME },
  });

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
      restaurantId_userId: {
        restaurantId: adminRestaurant.id,
        userId: authUserId,
      },
    },
    create: {
      restaurantId: adminRestaurant.id,
      userId: authUserId,
      role: 'PLATFORM_ADMIN',
      active: true,
    },
    update: { role: 'PLATFORM_ADMIN', active: true },
  });

  console.log(`  Granted PLATFORM_ADMIN to ${EMAIL}`);
  console.log('\n  Done. Sign in at /admin.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
