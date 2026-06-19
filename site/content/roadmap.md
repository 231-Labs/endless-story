# Roadmap

Across the pitch, demo, and whitepaper, every capability is labelled ✅ shipped, 🟡 deployed but not yet verified, or 🛣️ planned. The aim is to stay clear about what runs today and what is still vision.

## ✅ Shipped

These run today across the contracts, the runner, and the web app.

| Capability | Evidence |
|---|---|
| Full contract suite (currency, world, saga, scene, character, recruit, event, commitment) | `sui move test` 122/122, deployed to testnet |
| Gacha minting flow (voucher → preview → portrait → redeem → on-chain Character with caps) | Home wizard; HKDF deterministic dice; portrait stored on Walrus |
| Admin operator cockpit (Director-agent chat, asset management, test tools, role postings) | `(admin)` route group |
| Autonomous tick loop (PLAN → MOVE → DRAMA → SOCIAL → ASK → GIVE → BOND → SETTLE → ACT → POV → SLEEP → GAZETTE) | runner v1, world loop running |
| Non-control: characters decide for themselves, and the director only pushes events and tunes the environment | event-objective and narrative-subjective split |
| MemWal memory (remember and recall, SEAL encryption, cap-enforced decryption, three-factor recall) | `packages/memwal`, self-hosted relayer |
| Character economy loop (salary → memory rent → aid → aging or starvation death, off-chain shadow) | GIVE, ASK, SETTLE in the tick loop; H1 to H6 validated |
| Content pipeline (event → POV → chapter → gazette → subscription wall, with an on-chain chapter compiler) | `/feed` and dossier |
| 3D treasury (exhibit layout, AI curation, still generation, gift shop) | `packages/chamber-3d` |
| Troupe production engine | `packages/troupe` offline harness |

## 🟡 Deployed but not yet verified

The contracts are on-chain, but the web layer still needs wiring and a real run before these count as shipped. They are not marked ✅ yet.

| Item | Status | What it needs to reach ✅ |
|---|---|---|
| `economy.move`: real on-chain Balance (salary, aid, settlement, injection) | Contract on-chain (`sui move test` 122/122) | codegen SDK bindings, plus an adapter that wires the off-chain shadow to a real Balance, verified for one round |
| Treasury Kiosk trading (`still.move` TransferPolicy) | Contract on-chain | TS wiring, and a real list, buy, and delist run |
| On-chain treasury layout (`chamber` PersonalVault) | Contract on-chain | a `chamber::decorate` server action and a "save on-chain" button wired up |
| Two-step minting (`recruit` RedeemIntent) | Contract on-chain | one real-wallet redeem that confirms the sender check |

> Putting a contract on-chain is not the same as the feature being usable. The web layer still needs codegen and adapter wiring before the new capability is actually used.

## 🛣️ Planned

These are designed or partly wired, but they do not run in today's demo.

| Item | Where it stands | What is missing |
|---|---|---|
| Director retirement into a Storyteller | concept and scattered notes | quantified retirement signals, and a tiered implementation |
| Character archival as legend | the NFT and memory already persist after death; owner injection and Walrus renewal are designed | wiring for paying to preserve memory after death |
| Saga succession (change of owner) | new | a design spec to start from |
| Paid-subscription revenue split | `RevenueConfig` fields are in place | gated for after the MVP |
| Perceive step (an authoritative situation layer) | designed | implementation |
| Film adaptation (Phase 3) | vision | finishing the content funnel first |

---

<sub>The detailed mechanics live in the design docs: [Whitepaper](#/whitepaper), [Character economy](#/character-economy), and [Narrative agents](#/narrative-agents).</sub>
