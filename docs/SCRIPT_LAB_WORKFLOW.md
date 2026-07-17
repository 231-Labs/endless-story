# Scripts + Lab workflow

Private repos (231-Labs):

- [endless-story-scripts](https://github.com/231-Labs/endless-story-scripts) — seeds, seasons, story outputs
- [endless-story-lab](https://github.com/231-Labs/endless-story-lab) — runs, research, publication drafts

## Setup

Clone both repos next to this monorepo, then in `packages/web/.env.local`:

```bash
ES_SCRIPTS_ROOT=/Users/you/endless-story-scripts
ES_LAB_ROOT=/Users/you/endless-story-lab
ES_ACTIVE_PRESET=spring-snow
ES_ACTIVE_SEASON=anchun-after-curtain
```

## Run a season (engine)

```bash
pnpm --filter @endless-story/engine engine -- \
  run --ticks 18 --real-llm --relationship-fallback
```

With env vars set, defaults use `ES_ACTIVE_*` and write under `$ES_LAB_ROOT/runs/<today>/engine-run/`.

## Publish a run to lab

```bash
pnpm --filter @endless-story/cli lab:publish -- \
  --staging ./engine-run --slug anchun-s1 --commit
```

## Propose an article draft

```bash
pnpm --filter @endless-story/cli pub:propose -- --topic "柳安春契約與帳本"
```

Edit `lab/publications/drafts/`, then move to `ready/` when done. Ship to Medium/InkRay manually or via a future `pub:ship` script.

## Public repo tests

CI uses `packages/engine/test/fixtures/anchun-acceptance-frame.ts` (programmatic). Full narrative seasons live only in **scripts**.
