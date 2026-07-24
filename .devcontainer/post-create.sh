#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$ES_SCRIPTS_ROOT" "$ES_LAB_ROOT"
pnpm config set store-dir "$PNPM_HOME/store"
pnpm install --frozen-lockfile

# Give local commands the private-repo paths without copying placeholder API keys
# from .env.example. Existing developer configuration is never overwritten.
if [[ ! -f packages/web/.env.local ]]; then
  cat > packages/web/.env.local <<EOF
DATABASE_URL=$DATABASE_URL
ES_SCRIPTS_ROOT=$ES_SCRIPTS_ROOT
ES_LAB_ROOT=$ES_LAB_ROOT
ES_ACTIVE_PRESET=$ES_ACTIVE_PRESET
ES_ACTIVE_SEASON=$ES_ACTIVE_SEASON
SUI_NETWORK=testnet
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_WALRUS_AGGREGATOR=https://walrus.231labs.xyz
MODERATION_ALLOW_UNCONFIGURED=1
EOF
fi

printf '\nEndless Story container is ready.\n'
printf 'Private scripts: %s\nResearch lab:   %s\n' "$ES_SCRIPTS_ROOT" "$ES_LAB_ROOT"
printf 'Authenticate with gh auth login, then clone private repos into those directories when needed.\n'
