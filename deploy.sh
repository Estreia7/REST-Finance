#!/usr/bin/env bash
# Runs ON THE VPS, invoked over SSH by .github/workflows/deploy.yml.
#
# Deliberately does the build on the server (the house pattern for this box),
# so keep an eye on memory: it shares a 38GB volume with a dozen other apps.
set -euo pipefail

APP_DIR="/var/www/rest-finance"
APP_NAME="rest-finance"

cd "$APP_DIR"

echo "==> Fetching latest main"
git fetch --prune origin
git reset --hard origin/main

echo "==> Installing dependencies"
npm ci

echo "==> Applying database migrations"
# migrate deploy only: never `migrate dev` against production.
npx prisma migrate deploy

echo "==> Building"
npm run build

echo "==> Reloading PM2"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "==> Done"
