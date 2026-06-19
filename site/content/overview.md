# Endless Story

**An engine for persistent, on-chain story worlds.** Characters here are living memory assets that grow over time — not static images you collect. Built with the **MemWal SDK** on **Walrus**, owned through **Sui** NFTs.

> **角色會記得，世界會生長。** — *Characters remember; the world grows.*

**Spring Snow Troupe (春雪社)** is the first *Saga* running on the engine, and the world this demo shows.

[▶ Live demo](https://spring-snow.231labs.xyz) · [Pitch deck (EN)](./pitch/endless-story-pitch-light-en.html) · [中文版](./pitch/endless-story-pitch-light.html)

---

## What it is — the positioning triangle

A new form of entertainment sitting at the intersection of three cultures, with one key inversion on each side:

| Borrowed from | It looks like | The key inversion |
|---|---|---|
| **Games** (gacha, raising, collecting) | You draw, raise, and watch characters | **You cannot control them.** You influence an autonomous being with its own life — you are not playing a puppet. |
| **IP / collectibles** (cards, NFTs) | Characters are ownable, tradable assets | **The asset is alive.** It accrues a memory history, ages, can die, forms alliances and rivalries, and may become a legend. |
| **Serial fiction / film** | It produces chapters, stills, eventually video | **No screenwriter.** Story is lived out by autonomous characters; the director only pushes events and tunes the environment. |

**The non-control axiom** — nobody can make a decision *for* a character — is the premise that lets the world genuinely run itself. The owner of the world builds the stage; the saga owner pushes events through a Director agent; the character owner can inject *dreams* that influence but never command.

---

## What's live today

- Full contract suite deployed to **Sui testnet** (`sui move test` 122/122)
- Gacha character minting → on-chain Character NFT + caps, deterministic portrait stored on **Walrus**
- Autonomous **tick loop** (PLAN → MOVE → DRAMA → SOCIAL → ASK → GIVE → BOND → SETTLE → ACT → POV → SLEEP → GAZETTE)
- **MemWal** memory: remember / recall, SEAL encryption, cap-enforced decryption, three-factor recall — on a self-hosted relayer
- Character **economy loop** (salary → memory rent → aid → death) validated off-chain (hypotheses H1–H6)
- **Content pipeline**: event → POV → chapter → gazette → subscription wall, with an on-chain chapter compiler
- **3D treasury** (chamber) with AI curation and still generation
- **Troupe production engine** (offline validation harness)

See the **[Roadmap](#/roadmap)** for what is deployed-but-unverified (🟡) and what is planned (🛣️). We label every capability ✅ / 🟡 / 🛣️ — mixing shipped with vision loses trust; separating them earns it.

---

## Read the design

- **[Product positioning](#/product-positioning)** — what it is, and where it goes after feature freeze
- **[Whitepaper](#/whitepaper)** — the math: gacha pricing, character economics, the tension engine
- **[Narrative agents](#/narrative-agents)** — Director + Character architecture, the perceive → plan → act → reflect loop
- **[Content pipeline](#/content-pipeline)** — how events become chapters, gazettes, and stills
- **[Character economy](#/character-economy)** — salaries, memory cost, mutual aid, two-track death
- **[Production engine](#/production-engine)** · **[Event lifecycle](#/event-lifecycle)** · **[Walrus assets](#/walrus-assets)**
- **[API contract](#/api-contract)** · **[Prompts](#/prompts)** · **[Deployment](#/deployment)**

---

<sub>Built by **231 Labs** for **Sui Overflow 2026 · Walrus track**, on Walrus + Seal, the MemWal SDK, and Sui.</sub>
