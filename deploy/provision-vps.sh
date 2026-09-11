#!/usr/bin/env bash
# One-time provisioning of REST Finance on the Hetzner VPS (bruno-dev-01).
#
# Run ON THE SERVER as root:
#   curl -fsSL https://raw.githubusercontent.com/Estreia7/REST-Finance/main/deploy/provision-vps.sh | bash
# or clone first and run it locally.
#
# Idempotent: re-running skips anything already in place.
#
# IMPORTANT: rest-finance.bruno-dev.xyz currently serves AlumAI. This script
# will NOT overwrite an existing vhost; it writes the new config alongside and
# tells you what to do, so the switch stays a deliberate act.
set -euo pipefail

APP_NAME="rest-finance"
APP_DIR="/var/www/${APP_NAME}"
APP_PORT="3008"
DOMAIN="rest-finance.bruno-dev.xyz"
DB_NAME="rest_finance"
DB_USER="rest_finance"
REPO="https://github.com/Estreia7/REST-Finance.git"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !  %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- preflight
say "Checking the port is free"
if ss -tlnp 2>/dev/null | grep -q ":${APP_PORT} "; then
  echo "Port ${APP_PORT} is already in use:"
  ss -tlnp | grep ":${APP_PORT} "
  echo "Pick another port, then update ecosystem.config.js and deploy/nginx.conf."
  exit 1
fi
echo "Port ${APP_PORT} is free."

say "Current PM2 processes"
pm2 list || true

# ---------------------------------------------------------------- database
say "Database"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  echo "Role ${DB_USER} already exists, leaving it alone."
else
  DB_PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';"
  echo "Created role ${DB_USER}."
  echo
  echo "    DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
  echo
  warn "Record that line now. The password is not shown again."
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  echo "Database ${DB_NAME} already exists."
else
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  echo "Created database ${DB_NAME}."
fi

say "Checking Postgres is not exposed publicly"
if ss -tlnp 2>/dev/null | grep ':5432' | grep -qv '127.0.0.1\|::1'; then
  warn "Postgres appears to listen beyond localhost. Restrict it in"
  warn "postgresql.conf (listen_addresses) and pg_hba.conf, then reload."
  ss -tlnp | grep ':5432' || true
else
  echo "Postgres is localhost-only."
fi

# ---------------------------------------------------------------- app files
say "Application directory"
if [ -d "${APP_DIR}/.git" ]; then
  echo "${APP_DIR} already a checkout, fetching."
  git -C "${APP_DIR}" fetch --prune origin
  git -C "${APP_DIR}" reset --hard origin/main
else
  git clone "${REPO}" "${APP_DIR}"
fi

# Compliance documents live outside the web root and are only ever served
# through the authenticated route handler.
mkdir -p "${APP_DIR}/storage"
chmod 750 "${APP_DIR}/storage"

if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  warn "Created ${APP_DIR}/.env from the template. Fill it in before deploying:"
  warn "  DATABASE_URL, DIRECT_URL, Supabase keys, NEXT_PUBLIC_APP_URL"
  warn "Then re-run this script, or run deploy.sh manually."
  exit 0
fi

# ---------------------------------------------------------------- build
say "Installing and building"
cd "${APP_DIR}"
npm ci
npx prisma migrate deploy
npm run build

say "Starting under PM2"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

# ---------------------------------------------------------------- nginx
say "nginx"
AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

if [ -f "${AVAILABLE}" ] && ! grep -q "127.0.0.1:${APP_PORT}" "${AVAILABLE}"; then
  warn "${DOMAIN} already has a vhost pointing somewhere else."
  warn "It currently serves:"
  grep -E 'proxy_pass|root ' "${AVAILABLE}" | sed 's/^/      /' || true
  cp "${APP_DIR}/deploy/nginx.conf" "${AVAILABLE}.rest-finance-new"
  warn "Wrote the new config to ${AVAILABLE}.rest-finance-new without enabling it."
  warn "To switch over, once you are sure:"
  warn "  mv ${AVAILABLE}.rest-finance-new ${AVAILABLE} && nginx -t && systemctl reload nginx"
else
  cp "${APP_DIR}/deploy/nginx.conf" "${AVAILABLE}"
  ln -sfn "${AVAILABLE}" "${ENABLED}"

  # Certbot needs a cert in place before the TLS block will load.
  if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    warn "No certificate for ${DOMAIN} yet. Issue one with:"
    warn "  certbot --nginx -d ${DOMAIN}"
  else
    nginx -t && systemctl reload nginx
    echo "nginx reloaded."
  fi
fi

# ---------------------------------------------------------------- checks
say "Health check"
sleep 3
if curl -fsS "http://127.0.0.1:${APP_PORT}/" -o /dev/null; then
  echo "App responds on 127.0.0.1:${APP_PORT}."
else
  warn "App did not respond. Check: pm2 logs ${APP_NAME} --lines 50"
fi

say "Remaining manual steps"
cat <<'NOTES'
  1. Add rest_finance to the databases[] list in the ops dashboard config
     (Projetos/Server/config.js) so it appears at dashboard.bruno-dev.xyz.

  2. Backups currently live on the same 38GB volume with no off-box copy,
     and this disk has hit 99% before, silently stopping backups for 17 days.
     Before real client data lands, add an off-box target and include
     /var/www/rest-finance/storage in the backup set. Then test a restore.

  3. Disconnect the Vercel and Railway GitHub Apps from the repository, or
     they will keep firing failed deploys on every push.
NOTES
