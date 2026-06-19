# Roadmap

A hard rule across our pitch, demo, and whitepaper: **every capability is labelled ✅ shipped, 🟡 deployed-but-unverified, or 🛣️ planned.** Judges and players care most about which parts genuinely run today versus which are vision. Mixing the two loses trust; separating them earns it.

## ✅ Shipped — live and demoable

On-chain + runner + web, not placeholders.

| Capability | Evidence |
|---|---|
| Full contract suite (currency / world / saga / scene / character / recruit / event / commitment) | `sui move test` 122/122, deployed to testnet |
| Gacha minting flow (voucher → preview → portrait → redeem → on-chain Character + caps) | Home wizard; HKDF deterministic dice; portrait stored on Walrus |
| Admin operator cockpit (Director-agent chat, asset management, test tools, role postings) | `(admin)` route group |
| Autonomous tick loop (PLAN→MOVE→DRAMA→SOCIAL→ASK→GIVE→BOND→SETTLE→ACT→POV→SLEEP→GAZETTE) | runner v1, world-loop running |
| Non-control: characters decide for themselves; the director only pushes events / tunes environment | event-objective / narrative-subjective split |
| MemWal memory (remember / recall, SEAL encryption, cap-enforced decryption, three-factor recall) | `packages/memwal`, self-hosted relayer |
| Character economy loop (salary → memory rent → aid → aging / starvation death; off-chain shadow) | GIVE / ASK / SETTLE in tick loop; H1–H6 validated |
| Content pipeline (event → POV → chapter → gazette → subscription wall; on-chain chapter compiler) | `/feed` + dossier |
| 3D treasury (exhibit layout, AI curation, still generation, gift shop) | `packages/chamber-3d` |
| Troupe production engine | `packages/troupe` offline harness |

## 🟡 Deployed but not yet verified end-to-end

Contracts are on-chain, but the web layer still needs wiring + a real run before these count as shipped. **We do not present these as ✅.**

| Item | Status | Condition to reach ✅ |
|---|---|---|
| `economy.move` — real on-chain Balance (salary / aid / settlement / injection) | Contract on-chain (`sui move test` 122/122) | codegen SDK bindings + adapter wiring the off-chain shadow to real Balance, verified for one round |
| Treasury Kiosk trading (`still.move` TransferPolicy) | Contract on-chain | TS wiring + a real list / buy / delist run |
| On-chain treasury layout (`chamber` PersonalVault) | Contract on-chain | `chamber::decorate` server action + "save on-chain" button wired |
| Two-step minting (`recruit` RedeemIntent) | Contract on-chain | one real-wallet redeem confirming the sender check |

> **Redeploy ≠ ready.** After contracts go on-chain, the web layer still needs codegen + adapter wiring before the new capability is actually used.

## 🛣️ Planned

Designed or partly wired; not running in today's demo.

| Item | Where it stands | What's missing |
|---|---|---|
| Director retirement → Storyteller | concept + scattered notes | quantified retirement signals, tiered implementation |
| Character archival = legend | NFT + memory already persist after death; owner injection / Walrus renewal designed | "pay-to-preserve memory after death" wiring |
| Saga succession (change of owner) | new | start from a design spec |
| Paid-subscription revenue split | `RevenueConfig` fields in place | gated for after-MVP |
| Perceive step (authoritative situation layer) | designed | implementation pending |
| Film adaptation (Phase 3) | vision | after the content funnel is finished |

---

<sub>The full mechanism truth lives in the design docs — see **[Whitepaper](#/whitepaper)**, **[Character economy](#/character-economy)**, and **[Narrative agents](#/narrative-agents)**.</sub>
