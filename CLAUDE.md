# Endless Story

An engine for persistent, on-chain story worlds, built on **Walrus + Sui** with the **MemWal SDK**. Characters are living memory assets that grow over time, owned through Sui NFTs. See [README.md](./README.md) for the project overview and [`docs/`](./docs/) for design documentation.

## Monorepo layout

- `packages/web` — Next.js app: **春雪社看客殼**（`/`）＋ admin cockpit ＋ **片場** `/lab`（Cinema Lab；見 [`docs/CINEMA_LAB.md`](./docs/CINEMA_LAB.md)）
- `packages/runner` — autonomous tick / world loop (Director + Character agents)
- `packages/engine` — the single home for narrative mechanism: pure `src/core` (want, scene loop, routing, fatigue, box-office), ports/adapters/tick, and durable per-character sessions. See [`docs/narrative/ENGINE_CORE.md`](./docs/narrative/ENGINE_CORE.md)
- `packages/sdk`, `packages/shared` — Sui contract bindings + shared types
- `packages/memwal` — MemWal SDK integration (character memory on Walrus / Seal)
- `packages/relayer` — self-hosted MemWal relayer
- `packages/indexer` — durable chain-event store (Postgres capture + `queryEvents`-shaped reads)
- `packages/llm` — prompt registry + LLM client
- `packages/drama`, `packages/economy`, `packages/troupe` — engine validators (deterministic core, economy life cycle, troupe production)
- `packages/chamber-3d` — R3F 3D diorama renderer
- `packages/cli` — deploy / bootstrap / world-loop scripts
- `contracts/endless_story` — Move smart contracts

## Develop

```bash
nvm use                                   # Node 23.7.0 (pinned in .nvmrc)
pnpm install
pnpm --filter @endless-story/web dev      # http://localhost:3000
pnpm -r type-check                         # whole-repo green check
```

Needs Sui testnet access plus Poe, OpenAI, and MemWal credentials — see [`packages/web/.env.example`](./packages/web/.env.example). Then open `http://localhost:3000/admin/deploy` to deploy contracts and bootstrap a story preset.

## Documentation

Design docs live in [`docs/`](./docs/) — whitepaper, product positioning, narrative agent architecture, content pipeline, economy, deployment, and the Walrus asset model. The pitch deck is in [`pitch/`](./pitch/).

**Dev-branch agents:** scripts/lab workflow → [`skills/endless-story-scripts-lab/SKILL.md`](./skills/endless-story-scripts-lab/SKILL.md) (also via [`.claude/skills/`](./.claude/skills/) / [`.cursor/skills/`](./.cursor/skills/)); see [`AGENTS.md`](./AGENTS.md) and [`docs/SCRIPT_LAB_WORKFLOW.md`](./docs/SCRIPT_LAB_WORKFLOW.md).
