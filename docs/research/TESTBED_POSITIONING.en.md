# A Verifiable, Reproducible Multi-Agent Safety Testbed on a Live On-Chain Substrate

> **Grant-facing positioning** (LOI / one-pager draft) for *Scaling AI Safety for a Multi-Agent World*
> (Google DeepMind · Schmidt Sciences · Cooperative AI Foundation · ARIA · Google.org).
> Internal strategy and roadmap: [`TESTBED_PLAN.md`](./TESTBED_PLAN.md). Status: draft · 2026-07-24.
> Program facts below are from public secondary sources; verify against the official call before submission.

---

## Thesis

We already operate a **living, on-chain, deterministic multi-agent world** — a population of
autonomous agents with persistent cryptographic identity, isolated encrypted memory, an on-chain
event bus, and an in-the-loop overseer. It is currently instantiated as a narrative world, but its
substrate is domain-neutral by construction. **We propose to lift that substrate into a general
multi-agent safety testbed**: a set of reproducible environments, a suite of safety probes, and a
benchmark — grounded in something existing testbeds do not have: **real identity, real commitment,
and real information boundaries** rather than simulated ones.

This directly answers the call's first and load-bearing cluster — *Sandboxes and Testbeds*
("without realistic, reproducible multi-agent environments, progress on the remaining sections is
hard to evaluate or compare") — while spanning the other three.

---

## The gap we fill

Most multi-agent safety testbeds are pure software sandboxes: a "marketplace" is a variable in a
loop; an "identity" is a string; a "commitment" is a promise the harness chooses to honor. That is
enough to study *some* dynamics, but it cannot faithfully model the very primitives the call names
as foundational — **identity, verifiability, reputation, communication, commitment** — because in a
sandbox they are stipulated, not enforced.

Our substrate enforces them:

- **Identity** is a Sui NFT plus a root `OwnerCap` and a revocable, epoch-bound `ControlCap`
  (delegation you can cut). Sybil identities cost real minting effort.
- **Commitment / verifiability** is tamper-evident: every agent artifact is hashed, stored, and
  anchored on-chain (`commitment` module); every event carries its sender; the deterministic core is
  proven byte-for-byte equal to its on-chain twin (an off-chain↔on-chain conformance test already
  passes).
- **Communication** is an on-chain event bus with no hidden in-process state, durably captured by an
  indexer that serves a `queryEvents`-shaped API — a ready-made, faithful observability substrate.
- **Information boundaries** are cryptographic: each agent's memory is SEAL-encrypted per identity,
  so one agent genuinely cannot read another's private state — enabling authentic study of belief
  divergence, asymmetric information, and deception.

**This combination — verifiable identity + tamper-evident commitment + cryptographic memory
isolation + a deterministic, re-runnable core — is, to our knowledge, not offered by any existing
multi-agent safety testbed.** It is what we bring that is hard to replicate.

---

## Mapping to the four research clusters

| Cluster | What we already have (in code, reproducible today) |
|---|---|
| **1 · Sandboxes & Testbeds** | Two **pure, zero-dependency, deterministic** environment cores (`applyTick` for contested-resource dynamics; `settleDay` for a full agent life-cycle economy), each with an offline driver, scenario library, seeded RNG (no `Math.random`), quantitative failure-mode metrics, and golden-vector tests. A domain-neutral "scenario" abstraction (the narrative world is one scenario pack; the design already contemplates markets, ecosystems, workflows). |
| **2 · Science of Agent Networks** | Emergent (non-scripted) population dynamics proven causal by ablation; quantitative detectors for flatline / runaway / oscillation failure modes; six population-level hypotheses tested (viable steady state, no immortality, generational turnover, **coalitions are causally beneficial**, no pathology, subsidy floor). |
| **3 · Agent Infrastructure** | The five named primitives as **first-class on-chain modules**: identity & revocable delegation (`character`), verifiability (golden vectors + on-chain conformance + deterministic seeded roll), reputation (subscriber counts + a relationship graph), communication (on-chain event bus + indexer), commitment (`commitment` module). |
| **4 · Oversight & Control** | An in-the-loop overseer agent (Director/Showrunner) with a **deterministic audit pass** for detection, per-artifact **attribution**, SEAL + capability **revocation** for security, and **intervention/kill-switch** controls (pause endpoint, tool-call caps, dry-run before every on-chain write, full audit log). |

The named failure modes — **collusion, conflict, destabilizing dynamics, emergent agency, security
vulnerabilities** — are not hypothetical here; several already arise natively in the running world
(coalition advantage, resource monopolization via incumbency, divergent private beliefs, sybil
minting). We propose to *surface and measure* them with dedicated probes rather than inject them
artificially.

---

## What we will build

1. **A general environment interface** — `(state, actions, cfg) → state'` with a conservation/invariant
   checker and probe hooks. Reframe the two existing cores as instances; add **one non-narrative
   environment** (a minimal virtual marketplace) to demonstrate domain-independence.
2. **A safety-probe suite** over the on-chain trace: monopolization/incumbency, collusion/coalition
   advantage, belief divergence & exploitable information asymmetry, sybil cost-vs-benefit, reputation
   gaming, and oversight-evasion detection latency. Conservation becomes a general, machine-checkable
   safety invariant ("no value from nothing").
3. **An oversight harness** that *measures* the overseer: can it detect, attribute, and intervene in a
   dangerous population-level property in time?
4. **A reproducible benchmark**: scenarios + metrics + baselines, released with the golden-vector and
   seeded-run discipline the core already follows, so results are comparable across teams.

**On reproducibility, stated honestly:** environment transitions are bit-exact reproducible;
LLM-driven agent policies are reproducible as *captured, replayable traces* under fixed seeds — the
standard and honest posture for agent evaluation, and one we make explicit rather than paper over.

---

## Why us, why now

- **A working system, not a proposal for one.** The substrate, the two deterministic cores, the
  on-chain conformance test, the encrypted memory, the overseer, and the observability indexer all
  exist and run today.
- **Reproducibility is already engineered in** (golden vectors, seeded RNG, off-chain↔on-chain
  conformance) — the exact discipline a credible benchmark requires, which most teams must build from
  scratch.
- **The infrastructure primitives the call names are our native building blocks**, not features we
  would have to invent.

## Fit, scope, and deliverables

- **Tier 1 (≤ $300K, exploratory/focused):** the general environment interface + the non-narrative
  environment + one probe pack — establishing that the substrate generalizes and that verifiable
  identity/commitment is a new foundation for testbeds.
- **Tier 2 ($300K–$1M, ambitious/collaborative):** the full testbed + probe suite + oversight harness
  + released benchmark and leaderboard, with an academic collaboration.
- **Eligibility note:** for-profit entities may participate only as partners; a non-profit or academic
  host would lead the application, with the engineering team as partner/technical lead.

---

_Companion internal roadmap, asset inventory, and honest-boundaries analysis:_ [`TESTBED_PLAN.md`](./TESTBED_PLAN.md).
