#!/usr/bin/env bash
# One-time setup of the GitHub Actions secrets the deploy workflow needs.
#
# Run from the repo root:   bash deploy/setup-github-secrets.sh
#
# Requires the gh CLI, already authenticated (`gh auth status`).
# Safe to re-run: `gh secret set` overwrites.
set -euo pipefail

VPS_HOST_VALUE="49.13.150.6"
VPS_USER_VALUE="root"
DEPLOY_KEY="$HOME/.ssh/rest_finance_deploy"

echo "==> Host"
printf '%s' "$VPS_HOST_VALUE" | gh secret set VPS_HOST
printf '%s' "$VPS_USER_VALUE" | gh secret set VPS_USER

echo "==> Host keys"
# Pulled live so the fingerprints are whatever the server is actually serving.
ssh-keyscan -t rsa,ecdsa,ed25519 "$VPS_HOST_VALUE" 2>/dev/null | gh secret set VPS_KNOWN_HOSTS

echo "==> Deploy key"
if [ ! -f "$DEPLOY_KEY" ]; then
  # A dedicated key for CI, separate from your personal one: it can be
  # revoked on its own if a runner is ever compromised.
  ssh-keygen -t ed25519 -N "" -C "github-actions-rest-finance" -f "$DEPLOY_KEY"
  echo
  echo "    A new deploy key was created. Authorise it on the VPS:"
  echo
  echo "      ssh-copy-id -i ${DEPLOY_KEY}.pub ${VPS_USER_VALUE}@${VPS_HOST_VALUE}"
  echo
  echo "    or append this line to ~/.ssh/authorized_keys on the server:"
  echo
  sed 's/^/      /' "${DEPLOY_KEY}.pub"
  echo
fi

gh secret set VPS_SSH_KEY < "$DEPLOY_KEY"

echo
echo "==> Done. Secrets now set:"
gh secret list
echo
echo "Once the key is authorised on the VPS, trigger a deploy with:"
echo "  gh workflow run 'Deploy to VPS'"
