# Endless Story · design docs

> **Public design spec** (what the [docs site](https://231-labs.github.io/endless-story/) publishes): [`public/`](./public/) plus the entry pages authored in [`site/content/`](../site/content/) (`overview`, `architecture`, `roadmap`). Edit those when you want the external spec to change.
>
> **Internal engineering notes** (below): working journals for implementation. They may mix languages, carry TODOs, or lag the product. They are **not** copied to the docs site verbatim.
>
> **Research / academic material**: start from [`public/whitepaper.md`](./public/whitepaper.md) and [`research/WHITEPAPER.md`](./research/WHITEPAPER.md), then the deterministic harnesses in `packages/{drama,economy,troupe}`. A dedicated academic curation pass is planned: **English paper-style exports for citation**, with paired **Chinese working notes** for internal reading.

## Public map (curated)

| Page | Source of truth |
|---|---|
| Overview · Architecture · Roadmap | [`site/content/`](../site/content/) |
| Protocol · Memory · Narrative · Economy · Whitepaper | [`public/`](./public/) (synced into the site at deploy) |

English and Chinese live in paired files (`*.md` / `*.zh.md`).

## Internal map (engineering)

Organised by the three architecture layers. Useful for implementation detail; not the submission-facing spec.

```text
docs/
  public/           ← curated public spec (see above)
  protocol/         PRIMITIVES · WALRUS_STORAGE
  narrative/        NARRATIVE_AGENTS · ENGINE_CORE · NARRATIVE_PROFILE · EVENT_LIFECYCLE
                      CONTENT_PIPELINE · PRODUCTION_ENGINE · PROMPTS · CHARACTER_ECONOMY
                      ASSET_MANAGEMENT · DEPLOYMENT
  participation/    PRODUCT_POSITIONING · PRODUCTION_PLAN · PITCH_DECK · API_CONTRACT
  research/         WHITEPAPER (long-form research notes)
  CINEMA_LAB.md     片場 /lab — fully off-chain server-side experiment stage (usage + deploy)
  ACTOR_INTERVIEW.md  演員訪談室 — /lab actor-interview room: snapshot-frozen character研究台 (implemented V1)
```

Suggested reading order for engineers: [protocol/PRIMITIVES.md](./protocol/PRIMITIVES.md) → [narrative/NARRATIVE_AGENTS.md](./narrative/NARRATIVE_AGENTS.md) → [participation/PRODUCT_POSITIONING.md](./participation/PRODUCT_POSITIONING.md).

## Research starting points

| Topic | Where to look |
|---|---|
| Formulas + evidence table | [`public/whitepaper.md`](./public/whitepaper.md) |
| Long-form mechanism notes | [`research/WHITEPAPER.md`](./research/WHITEPAPER.md) |
| Tension / rivalry dynamics | `packages/drama` + [`narrative/EVENT_LIFECYCLE.md`](./narrative/EVENT_LIFECYCLE.md) |
| Character economy hypotheses | `packages/economy` + [`narrative/CHARACTER_ECONOMY.md`](./narrative/CHARACTER_ECONOMY.md) |
| Troupe production pipeline | `packages/troupe` + [`narrative/PRODUCTION_ENGINE.md`](./narrative/PRODUCTION_ENGINE.md) |
