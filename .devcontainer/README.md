# Development container

Open the repository in VS Code/Codespaces and choose **Reopen in Container**. The
container provides the full Node 23 + pnpm workspace and the extra capabilities
needed for narrative, media, browser, contract, and infrastructure work:

- Chromium plus the Playwright VS Code integration for UI checks and screenshots;
- FFmpeg, ImageMagick, and Noto CJK fonts for video, still, subtitle, and Chinese text work;
- Python 3, `jq`, and `ripgrep` for research and run analysis;
- Docker CLI access for building every production image;
- GitHub CLI for authentication and pull requests;
- a persistent PostgreSQL 17 sidecar for indexer development;
- persistent pnpm, browser, database, and private-repository volumes.

The setup creates a minimal, gitignored `packages/web/.env.local`. It does **not**
copy secrets or placeholder API keys. Add provider keys there only when a real-LLM
or image-generation run needs them.

## Private narrative repositories

After `gh auth login`, populate the persistent directories (the directories are
created automatically):

```bash
git clone git@github.com:231-Labs/endless-story-scripts.git \
  "$ES_SCRIPTS_ROOT"
git clone git@github.com:231-Labs/endless-story-lab.git \
  "$ES_LAB_ROOT"
```

If an empty directory already exists, remove it before cloning. These repositories
live in the `private-repos` Docker volume and can never be accidentally committed
to the public workspace.

## Useful checks

```bash
pnpm --filter @endless-story/web dev
pnpm --filter @endless-story/web type-check
pnpm --filter @endless-story/web test
docker build -f Dockerfile.cinema-lab .
psql "$DATABASE_URL"
chromium --headless --no-sandbox --screenshot=/tmp/home.png http://localhost:3000
```
