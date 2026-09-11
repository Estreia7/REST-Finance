# REST Finance

Financial management for restaurants. Owners log the day's revenue and costs; the app calculates prime cost, food cost and net margin against the ranges that actually matter in restaurant operations, so the month's result is known during the month rather than weeks later.

**Live:** https://rest-finance.bruno-dev.xyz
**Status:** private beta, free. Accounts are created on request.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (`strict`) |
| Database | PostgreSQL 16, accessed through Prisma 7 (`@prisma/adapter-pg`) |
| Styling | Tailwind CSS, fully CSS-variable driven (light + dark) |
| Auth | Supabase Auth *(migrating to Auth.js, see Roadmap)* |
| Payments | Stripe (implemented, dormant during the free beta) |
| Hosting | Hetzner VPS, PM2 + nginx + Let's Encrypt |
| CI/CD | GitHub Actions: verify, then deploy over SSH |
| Tests | Vitest |

---

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npx prisma migrate dev
npm run dev
```

Runs on http://localhost:3000.

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Serve a production build |
| `npm test` | Vitest |
| `npx tsc --noEmit` | Typecheck |

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (pooled) |
| `DIRECT_URL` | Direct connection, used for migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (auth only) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (auth only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Admin user management. |
| `NEXT_PUBLIC_APP_URL` | Public origin, used for metadata and callbacks |
| `STRIPE_SECRET_KEY` | Optional while billing is dormant |
| `STRIPE_WEBHOOK_SECRET` | Required if Stripe is enabled |
| `DOCUMENT_SCANNER_API_URL` | Optional. Enables invoice scanning. |

Never commit `.env` or `.env.local`; both are gitignored.

---

## Architecture

```
app/
  page.tsx            Landing page
  dashboard/          Owner app. Server actions live in *-actions.ts
  admin/              Platform admin console
  api/                Route handlers (exports, scanning, Stripe webhook)
lib/
  kpi.ts              Financial calculations. Single source of truth.
  auth-helpers.ts     requireAuth / requireOwner / requireMember
  validations.ts      Zod schemas for every mutating input
  errors.ts           toClientError: log internally, return safe messages
  translations.ts     PT/EN dictionary
prisma/
  schema.prisma       Data model
  migrations/         Applied with `migrate deploy`, never `migrate dev`
deploy/
  nginx.conf          Server vhost, versioned here
```

### Two rules worth knowing before changing anything

**All financial arithmetic goes through `lib/kpi.ts`.** It previously existed but was unused while four call sites reimplemented the same formulas inline and disagreed with each other. Prime cost was reported one way on the dashboard and another way in the PDF. If you need a derived financial figure, add it to `lib/kpi.ts` with a test rather than computing it at the call site.

**Tenant scoping goes through `lib/auth-helpers.ts`.** `requireOwner()` and `requireMember()` return a `restaurantId` that every query must filter on. Never accept a `restaurantId` from the client. Mutations follow fetch-then-verify: load the row scoped to the caller's restaurant, confirm it exists, then update by id.

---

## Deployment

Push to `main` runs **CI** (typecheck, tests, build). Only if CI passes does **Deploy** run, which SSHes to the VPS and executes `deploy.sh`: fetch, `npm ci`, `prisma migrate deploy`, build, `pm2 startOrReload`, then verify the site returns 200.

Required repository secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | Server address |
| `VPS_USER` | Deploy user |
| `VPS_SSH_KEY` | Private half of a dedicated ed25519 deploy key |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan <host>` |

The app runs under PM2 as `rest-finance` on port 3008, behind the nginx vhost in [`deploy/nginx.conf`](deploy/nginx.conf).

### First-time server setup

```bash
# On the VPS
sudo -u postgres psql -c "CREATE ROLE rest_finance WITH LOGIN PASSWORD '<strong>';"
sudo -u postgres psql -c "CREATE DATABASE rest_finance OWNER rest_finance;"

git clone https://github.com/Estreia7/REST-Finance.git /var/www/rest-finance
cd /var/www/rest-finance
# create .env with production values
npm ci && npx prisma migrate deploy && npm run build
pm2 start ecosystem.config.js && pm2 save

# nginx
cp deploy/nginx.conf /etc/nginx/sites-available/rest-finance.bruno-dev.xyz
ln -s /etc/nginx/sites-available/rest-finance.bruno-dev.xyz /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d rest-finance.bruno-dev.xyz
```

Postgres should listen on `localhost` only. Do not expose 5432.

---

## Roadmap

- Migrate auth from Supabase to Auth.js, adding Google sign-in
- Move the database from Supabase to the VPS Postgres
- Support tickets: clients report issues, resolved from the admin console
- Compliance vault: insurance, HACCP and licence documents with expiry alerts
- Per-employee wage tracking feeding prime cost
- Multi-restaurant switching for owners with more than one site
- Invoice scanning via Claude vision

---

## Licence

Private and unlicensed. All rights reserved.
