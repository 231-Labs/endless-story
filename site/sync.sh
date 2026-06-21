#!/usr/bin/env bash
# Re-copy the curated public docs (and the pitch decks) into the docs-site.
# Run from anywhere:  bash site/sync.sh
# overview / roadmap / architecture (+ their .zh variants) are authored directly
# in site/content and are NOT overwritten here.
set -euo pipefail
cd "$(dirname "$0")/.."
C=site/content

# clear previously-generated copies (keep the authored entry pages)
find "$C" -maxdepth 1 -name '*.md' ! -name 'overview*' ! -name 'roadmap*' ! -name 'architecture*' -delete

# protocol
cp docs/protocol/PRIMITIVES.md        "$C/primitives.md"
cp docs/protocol/WALRUS_STORAGE.md    "$C/walrus-storage.md"
# narrative
cp docs/narrative/NARRATIVE_AGENTS.md "$C/narrative-agents.md"
cp docs/narrative/EVENT_LIFECYCLE.md  "$C/event-lifecycle.md"
cp docs/narrative/CONTENT_PIPELINE.md "$C/content-pipeline.md"
cp docs/narrative/PRODUCTION_ENGINE.md "$C/production-engine.md"
cp docs/narrative/PROMPTS.md          "$C/prompts.md"
cp docs/narrative/CHARACTER_ECONOMY.md "$C/character-economy.md"
cp docs/narrative/ASSET_MANAGEMENT.md "$C/asset-management.md"
cp docs/narrative/DEPLOYMENT.md       "$C/deployment.md"
# participation
cp docs/participation/PRODUCT_POSITIONING.md "$C/product-positioning.md"
cp docs/participation/PRODUCTION_PLAN.md     "$C/production-plan.md"
cp docs/participation/PITCH_DECK.md          "$C/pitch-deck.md"
cp docs/participation/API_CONTRACT.md        "$C/api-contract.md"
# research
cp docs/research/WHITEPAPER.md        "$C/whitepaper.md"

# self-contained copy of the pitch decks
rm -rf site/pitch
cp -R pitch site/pitch
cp pitch/assets/logo.png site/assets/logo.png

echo "Docs site synced ($(ls "$C"/*.md | wc -l | tr -d ' ') content pages)."
