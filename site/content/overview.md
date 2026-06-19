# Endless Story

Endless Story is an engine for persistent, on-chain story worlds. The characters are living memory assets that grow over time, not static images you collect. They are built with the MemWal SDK on Walrus and owned through Sui NFTs.

> 角色會記得，世界會生長。 (Characters remember; the world grows.)

Spring Snow Troupe (春雪社) is the first *Saga* running on the engine, and the world shown in this demo.

[▶ Live demo](https://spring-snow.231labs.xyz) · [Pitch deck (EN)](./pitch/endless-story-pitch-light-en.html) · [中文版](./pitch/endless-story-pitch-light.html)

---

## What it is

Endless Story borrows from three familiar things and changes one rule in each:

| Borrowed from | It looks like | What changes |
|---|---|---|
| **Games** (gacha, raising, collecting) | You draw, raise, and watch characters | You cannot control them. You influence a character who has its own life. |
| **IP and collectibles** (cards, NFTs) | Characters are ownable, tradable assets | The asset is alive. It builds a memory history, ages, can die, and forms alliances and rivalries. |
| **Serial fiction and film** | It produces chapters, stills, and eventually video | There is no screenwriter. The characters live the story out, and the director only pushes events and adjusts the environment. |

The core rule is that nobody can make a decision for a character. That is what lets the world run on its own. The world owner builds the stage. The saga owner pushes events through a Director agent. The character owner can send in dreams that influence a character, but cannot command it.

---

## What runs today

- Full contract suite deployed to Sui testnet (`sui move test` 122/122)
- Gacha character minting: an on-chain Character NFT with caps, and a deterministic portrait stored on Walrus
- An autonomous tick loop (PLAN → MOVE → DRAMA → SOCIAL → ASK → GIVE → BOND → SETTLE → ACT → POV → SLEEP → GAZETTE)
- MemWal memory: remember and recall, SEAL encryption, cap-enforced decryption, and three-factor recall, on a self-hosted relayer
- A character economy loop (salary → memory rent → aid → death), validated off-chain across hypotheses H1 to H6
- A content pipeline (event → POV → chapter → gazette → subscription wall), with an on-chain chapter compiler
- A 3D treasury (chamber) with AI curation and still generation
- A troupe production engine, with an offline validation harness

The [Roadmap](#/roadmap) lists what is deployed but not yet verified (🟡) and what is planned (🛣️). Every capability is labelled ✅, 🟡, or 🛣️, so it stays clear what runs today and what is still ahead.

---

## Read the design

- **[Product positioning](#/product-positioning)**: what it is, and where it goes after feature freeze
- **[Whitepaper](#/whitepaper)**: gacha pricing, character economics, and the tension engine
- **[Narrative agents](#/narrative-agents)**: the Director and Character agents, and the perceive, plan, act, reflect loop
- **[Content pipeline](#/content-pipeline)**: how events become chapters, gazettes, and stills
- **[Character economy](#/character-economy)**: salary, memory cost, mutual aid, and two-track death
- **[Production engine](#/production-engine)** · **[Event lifecycle](#/event-lifecycle)** · **[Walrus assets](#/walrus-assets)**
- **[API contract](#/api-contract)** · **[Prompts](#/prompts)** · **[Deployment](#/deployment)**

---

<sub>Built by 231 Labs for Sui Overflow 2026 · Walrus track, on Walrus, Seal, the MemWal SDK, and Sui.</sub>
