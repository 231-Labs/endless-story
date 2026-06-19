# Docs site

A self-contained static documentation site for **Endless Story** — the curated public design docs plus an Overview and Roadmap, deployable to GitHub Pages. Markdown is rendered in the browser by the vendored `vendor/marked.min.js`, so there is **no build step and no dependencies**.

## Local preview

```bash
bash site/sync.sh                        # copy curated docs + pitch decks into the site
python3 -m http.server -d site 8099      # then open http://localhost:8099
```

The content pages are generated from [`../docs/`](../docs/) by `sync.sh`; only `content/overview.md` and `content/roadmap.md` are authored directly here. The generated copies are git-ignored to avoid duplicating the docs in the repo.

## Deploy (GitHub Pages)

The workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) runs `sync.sh` and publishes `site/` on every push to `main`.

**One-time setup:** repo **Settings → Pages → Source: _GitHub Actions_**.

## Structure

- `index.html` — app shell (sidebar nav + content pane)
- `assets/styles.css`, `assets/app.js` — theme + hash-router that fetches and renders the Markdown
- `content/overview.md`, `content/roadmap.md` — authored landing + roadmap
- `content/*.md` — generated copies of the public docs (git-ignored)
- `pitch/` — self-contained copy of the pitch decks (git-ignored)
- `vendor/marked.min.js` — Markdown renderer
