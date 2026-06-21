# Research and validation · 研究與驗證

The mechanism work that was proven before it was productised. These are validation harnesses and formula sheets, not shipped features.

## Contents

- [Whitepaper](./WHITEPAPER.md) — the math: gacha pricing, character economics, and the tension engine.
- **Character economy validation** — the pure-simulation harness `packages/economy` checks the life-cycle hypotheses (H1 to H6) before any on-chain wiring. Design and results: [Character economy](../narrative/CHARACTER_ECONOMY.md).
- **Deterministic drama core** — `packages/drama` calibrates and validates the tension and resource-conservation engine. Writeup: `packages/drama/WRITEUP.md`.
- **Troupe production** — `packages/troupe` is an offline harness for the play-production pipeline (scripting, casting, composition, versification). Notes: `packages/troupe/README.md`.

## Why this is separate

The validators are deterministic and run with zero external dependencies, so a claim can be reproduced without a chain or an LLM. Keeping them apart from the layer docs keeps "what is proven" distinct from "what is shipped."
