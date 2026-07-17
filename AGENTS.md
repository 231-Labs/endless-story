# Endless Story — agent notes

Project overview, monorepo layout, and standard dev commands live in [`CLAUDE.md`](./CLAUDE.md) and [`README.md`](./README.md). Read those first.

## Cursor Cloud specific instructions

Environment is prepared by the startup update script (`nvm install`/`use` of the `.nvmrc` version + `pnpm install`). The notes below are the non-obvious caveats for developing here.

### Node / pnpm
- This repo runs raw TypeScript via Node's native type-stripping, so it **requires Node 23.7.0** (pinned in `.nvmrc`). Tests (`node --test` on `*.ts`) and the relayer (`node src/server.ts`) fail on older Node.
- The base image ships a `/exec-daemon/node` (v22.x) that sits ahead of nvm on `PATH`. Setup added a line to `~/.bashrc` that prepends the nvm 23.7.0 bin, so **fresh shells already resolve `node` → v23.7.0** (verify with `node --version`). If a shell ever shows v22.x, run `nvm use` (reads `.nvmrc`) or re-open the shell.
- `pnpm` (10.5.2) is provided via corepack under the nvm Node.

### Lint / test / build
- There is **no ESLint**; "lint" in this repo is type-checking: `pnpm -r type-check`.
- Tests use the Node built-in runner: `pnpm -r --filter "@endless-story/*" test`.
- Only `packages/web` has a real build (`next build`); other packages are consumed as raw TS.

### Running the app
- `pnpm dev` starts the Next.js web app (admin cockpit + reader site) at http://localhost:3000. This is the only process needed for basic dev.
- The canonical env file is `packages/web/.env.local` (gitignored; template in `packages/web/.env.example`). Other packages read it via `--env-file-if-exists=../web/.env.local`.
- Contract IDs for Sui **testnet are already committed** (`packages/shared/src/contract-ids.ts`), so the app reads live on-chain/Walrus state against public endpoints with **no secrets**. The reader flow works read-only: `/` (home), `/feed` (generated chapters), and chapter detail pages render real content.
- Flows that need credentials in `.env.local`: on-chain **writes** (`POST /api/tick`, minting, `/admin/deploy`) need `SUI_ADMIN_PRIVATE_KEY`; narrative/image generation needs LLM (`ZAI_API_KEY`/`POE_API_KEY`) + `OPENAI_API_KEY`. `MODERATION_ALLOW_UNCONFIGURED=1` lets moderation pass without an LLM key in dev.
- Known empty/error states without a connected wallet / full data scope: `/dossier` (character roster) can show "0 人", and `/saga/[id]` may throw a transient "Connection closed" in dev. These are data/auth-scope states, not build breakage — the core reader flow above is the reliable smoke test.

### Optional services (not needed for basic dev)
- `packages/relayer`: `pnpm --filter @endless-story/relayer dev` (port 8787) — self-hosted MemWal memory recall.
- `packages/cli` world-loop: automates ticks by POSTing to `/api/tick` (needs `WORLD_LOOP_URL` + `TICK_LOOP_SECRET`; supports `--dry-run`).
- Postgres event indexer: gated on `DATABASE_URL`; unset falls back to live RPC.
