#!/usr/bin/env bash
# Re-copy the curated public docs (and the pitch decks) into the docs-site.
# Run from anywhere:  bash site/sync.sh
# overview / roadmap / architecture (+ their .zh variants) are authored directly
# in site/content. The remaining public pages come from docs/public. Detailed
# engineering journals elsewhere under docs/ are intentionally not published.
set -euo pipefail
cd "$(dirname "$0")/.."
C=site/content

# clear previously-generated copies (keep the authored entry pages)
find "$C" -maxdepth 1 -name '*.md' ! -name 'overview*' ! -name 'roadmap*' ! -name 'architecture*' -delete

for slug in protocol memory narrative economy whitepaper; do
  cp "docs/public/$slug.md" "$C/$slug.md"
  cp "docs/public/$slug.zh.md" "$C/$slug.zh.md"
done

# self-contained copy of the pitch decks
rm -rf site/pitch
cp -R pitch site/pitch
cp pitch/assets/logo.png site/assets/logo.png

echo "Docs site synced ($(ls "$C"/*.md | wc -l | tr -d ' ') content pages)."
