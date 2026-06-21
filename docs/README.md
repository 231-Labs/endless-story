# Endless Story · design docs

These docs are organised by the three layers of the architecture. The same model is on the pitch deck and the [docs site](https://231-labs.github.io/endless-story/).

## The three layers

1. **Protocol** (協議) — the on-chain foundation. World, Saga, Scene, Character, Event, and the Walrus storage substrate. Objective, shared history.
2. **Narrative** (敘事) — the engine and ops tools. The runner, the Director and Character agents, memory, the content pipeline, and the backstage.
3. **Participation** (用戶參與) — the user-facing side. Claiming a character, audience and subscription, and the IP revenue that pays characters' running costs.

Plus a **Research** (研究) section for the validation harnesses and formula sheets.

## Map

```text
docs/
  protocol/       PRIMITIVES · WALRUS_STORAGE
  narrative/      NARRATIVE_AGENTS · EVENT_LIFECYCLE · CONTENT_PIPELINE · PRODUCTION_ENGINE
                  PROMPTS · CHARACTER_ECONOMY · ASSET_MANAGEMENT · DEPLOYMENT
  participation/  PRODUCT_POSITIONING · PRODUCTION_PLAN · PITCH_DECK · API_CONTRACT
  research/       WHITEPAPER  (plus the packages/{drama,economy,troupe} validators)
```

Start with [protocol/PRIMITIVES.md](./protocol/PRIMITIVES.md) for the object model, then [narrative/NARRATIVE_AGENTS.md](./narrative/NARRATIVE_AGENTS.md) for the engine, and [participation/PRODUCT_POSITIONING.md](./participation/PRODUCT_POSITIONING.md) for the product.
