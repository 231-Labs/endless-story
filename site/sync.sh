#!/usr/bin/env bash
# Re-copy the curated public docs (and the pitch decks) into the docs-site.
# Run from anywhere:  bash site/sync.sh
# overview.md and roadmap.md are authored directly in site/content and are NOT overwritten.
set -euo pipefail
cd "$(dirname "$0")/.."
C=site/content

cp docs/PRODUCT_POSITIONING.md "$C/product-positioning.md"
cp docs/WHITEPAPER.md          "$C/whitepaper.md"
cp docs/NARRATIVE_AGENTS.md    "$C/narrative-agents.md"
cp docs/CONTENT_PIPELINE.md    "$C/content-pipeline.md"
cp docs/CHARACTER_ECONOMY.md   "$C/character-economy.md"
cp docs/PRODUCTION_ENGINE.md   "$C/production-engine.md"
cp docs/EVENT_LIFECYCLE.md     "$C/event-lifecycle.md"
cp docs/PITCH_DECK.md          "$C/pitch-deck.md"
cp docs/WALRUS_ASSETS.md       "$C/walrus-assets.md"
cp docs/API_CONTRACT.md        "$C/api-contract.md"
cp docs/PROMPTS.md             "$C/prompts.md"
cp docs/DEPLOYMENT.md          "$C/deployment.md"

# Self-contained copy of the pitch decks so the Pages deploy is complete.
rm -rf site/pitch
cp -R pitch site/pitch
cp pitch/assets/logo.png site/assets/logo.png

echo "Docs site synced ($(ls "$C"/*.md | wc -l | tr -d ' ') content pages)."
