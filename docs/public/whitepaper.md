# Mechanism whitepaper

This document describes the mechanisms that can be stated and tested mathematically. It separates formulas implemented in product code, mechanisms validated in simulators, and economic parameters that still require live calibration.

## Character generation

Every recruitment voucher contains a 32-byte seed. Four innate attributes are derived with domain-separated HKDF-SHA256:

$$x_i = \operatorname{u32}(\operatorname{HKDF}(seed, axis_i)) \bmod 101$$

Each $x_i$ lies in $[0,100]$. A single axis is approximately uniform; the sum of four independent axes is concentrated around the middle.

For a recruitment with minimum requirement $m_i$ on each required axis, the probability that one draw qualifies is:

$$p = \prod_i \frac{101-m_i}{101}$$

The expected number of draws is therefore:

$$E[draws] = \frac{1}{p}$$

The guaranteed option is priced from that expected effort:

$$bulkPrice = \max\left(basePrice,\operatorname{round}_{10}\left(basePrice \times E[draws] \times margin\right)\right)$$

The current suggested margin is $0.85$. It makes the guaranteed option slightly cheaper than the average cost of repeated independent draws, while leaving a single draw available to readers who prefer variance.

The formula is implemented in `packages/web/src/lib/recruit-pricing.ts`. Gender and prose traits do not enter the probability calculation; contract requirements validate those separately.

## Memory recall

Memories are ranked by three factors:

$$score_j = I_j \times R_j \times S(q,m_j)$$

where $I_j$ is normalized importance, $S(q,m_j)$ is semantic similarity to the current query, and narrative recency is:

$$R_j = 0.5^{\frac{today-day_j}{h}}$$

$h$ is the half-life in narrative days. The self-hosted relayer scores the full character namespace; the client path can also re-rank an over-fetched semantic candidate set.

Pinned genesis memories, plans, and consolidated reflections may bypass the ordinary relevance floor. This prevents identity-bearing memory from disappearing merely because the current query is phrased differently.

## Scarcity and dramatic tension

The drama core models a desire with importance $w$ and satisfaction $s$, both represented in deterministic fixed-point arithmetic. Tension is derived rather than stored:

$$tension = w\left(1-s\right)$$

Satisfaction moves toward a target with separate gain and loss rates:

$$s_{t+1} = s_t + \alpha\left(target-s_t\right)$$

The calibrated core uses a faster loss rate than gain rate. Losing a contested opportunity therefore hurts faster than holding it becomes ordinary. A small habituation term pulls satisfaction toward a baseline, preventing permanent success from becoming a flat line.

Two additional constraints make rivalry legible:

- a challenger must exceed the current holder by a seize margin;
- actions consume a finite budget that refills over time.

Without those constraints, the simulated holder flips almost every tick. With them, ownership changes on a slower rhythm driven by a visible tension peak. The negative-control and ablation runs live in `packages/drama`.

## Character economy

The daily cost model is:

$$dailyCost = C_{run}a + C_{mem}m + C_{img}i + C_{recall}r$$

Salary and cost determine net flow:

$$netFlow = salary - dailyCost$$

When $netFlow < 0$, runway is estimated as:

$$runway = \left\lfloor\frac{balance}{-netFlow}\right\rfloor$$

Repeated insolvency reduces vitality with increasing damage, while age contributes a separate hazard after a hidden onset:

$$vitality_{t+1}=\operatorname{clamp}(vitality_t+recovery-econDamage-ageHazard,0,100)$$

The pure economy harness validates conservation and six behavioral hypotheses. The product currently uses this transition in an off-chain shadow. The Move balance rails exist, but their end-to-end product adapter is not yet the source of truth for displayed balances.

## Verification boundaries

| Mechanism | Current evidence |
|---|---|
| Character rolls and guaranteed pricing | Implemented in the recruitment flow and covered by code-level tests. |
| Three-factor recall | Implemented in MemWal client code and the self-hosted relayer. |
| Tension dynamics | Deterministic simulator, golden vectors, negative controls, and ablations in `packages/drama`. |
| Character economy | Deterministic simulator and hypothesis tests in `packages/economy`; live UI still uses a settlement shadow. |
| Resource settlement | Move rails and web event-spine adapter exist; live behavior depends on the active deployment and RPC execution. |

The project avoids treating “implemented,” “deployed,” and “verified in a live run” as synonyms. The [Roadmap](#/roadmap) records those boundaries at product level.
