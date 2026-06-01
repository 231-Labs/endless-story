// The 3 primitives (+ world container + tuning) for the Desire/Resource Drama Engine.
//
// Pure data. No I/O, no LLM, no chain. The SAME module is imported by the simulator and
// (later) the product — the transition is never reimplemented (spec §9 Step 3).
//
// Every numeric domain field is a `bigint` (see fixed.ts for why). "scaled" = lives in
// [0n, SCALE] and maps to a Move u64; counts (capacity, claim, allocations, amounts) are
// non-negative bigints (Move u64).

import { SCALE } from "./fixed.ts";

/** A single resource a desire draws satisfaction from, and how much of it it wants. */
export interface ResourceClaim {
  resource_id: string;
  /** units the desire wants in order to feel fully satisfied (Move u64). */
  claim: bigint;
}

/**
 * Demand side. `satisfaction` is the only mutable affective state; everything else is a
 * (mostly) static descriptor. `draws_from` is the dependency edge that REPLACES the old
 * `threatened_by`/`fulfilled_by` magic strings — satisfaction is *derived* from the
 * agent's current allocation of these resources (spec §1, §2).
 */
export interface Desire {
  id: string;
  /** narrative-facing only; never used in math. */
  statement: string;
  /** scaled [0..SCALE]: how much this desire matters. weight-drift = v2, out of scope. */
  weight: bigint;
  /** scaled [0..SCALE]: current felt satisfaction (THE state that evolves each tick). */
  satisfaction: bigint;
  /** scaled [0..SCALE]: habituation anchor that satisfaction slowly decays toward. */
  baseline: bigint;
  /** scaled [0..SCALE]: modulates relaxation rate (0 = frozen, SCALE = full alpha). */
  volatility: bigint;
  /** the dependency edge: which resources (and how much of each) feed this desire. */
  draws_from: ResourceClaim[];
}

/**
 * Optional deterministic per-tick top-up for a resource — the locked "fixed per-tick
 * refill" action-budget decision (brief §3.1). It lives INSIDE applyTick (a REFILL phase),
 * NOT in the driver, so re-running applyTick alone reproduces budget state and the whole
 * transition stays on-chain verifiable. Contested zero-sum resources (the 孟雲屏 partnership
 * slot) simply omit `refill`.
 */
export interface ResourceRefill {
  /** the agent whose allocation is topped up each tick. */
  to: string;
  /** units added per tick, capped so the holder's allocation never exceeds capacity. */
  amount: bigint;
}

/**
 * Supply side — the scarcity. INVARIANT (conservation, on-chain verifiable):
 *   sum(allocations.values()) <= capacity
 * Maps onto a Move resource type whose linear-type invariant forbids copy/drop of
 * allocated units (spec §7).
 */
export interface Resource {
  id: string;
  /** total units that exist (Move u64). */
  capacity: bigint;
  /** who holds how many units. An absent agent holds 0. (Move Table<address,u64>.) */
  allocations: Record<string, bigint>;
  /** optional deterministic per-tick refill (models a per-agent action budget). */
  refill?: ResourceRefill;
}

/** A reallocation of units of one resource. `from` absent = draw from the free pool. */
export interface Transfer {
  resource_id: string;
  from?: string;
  to: string;
  amount: bigint;
}

/** A cost debited from the actor's own allocation of a resource (e.g. schedule budget). */
export interface Cost {
  resource_id: string;
  amount: bigint;
}

/**
 * The ONLY way satisfaction can move: reallocate resources. Validated, then applied, by the
 * resource phase. An action is atomic — if any transfer or cost is infeasible the whole
 * action is rejected (no partial application), deterministically.
 */
export interface Action {
  actor: string;
  transfers: Transfer[];
  cost: Cost[];
}

export interface AgentState {
  id: string;
  desires: Desire[];
}

export interface WorldState {
  agents: AgentState[];
  resources: Record<string, Resource>;
  tick: bigint;
}

/**
 * Calibration knobs (spec §11). Threaded into applyTick rather than hardcoded so the
 * simulator can run >1 scenario and Stage-2 parameter sweeps. This config is part of the
 * committed transition (alongside the fn version) for on-chain verifiability.
 *
 * All scaled [0..SCALE]. Loss aversion REQUIRES alphaDown > alphaUp (spec §3). Boundedness
 * by construction requires alphaUp, alphaDown, gamma ≤ SCALE.
 */
export interface TuningConfig {
  /** relaxation rate when satisfaction RISES toward target (smaller = slower gains). */
  alphaUp: bigint;
  /** relaxation rate when satisfaction FALLS toward target (larger = loss aversion). */
  alphaDown: bigint;
  /** habituation pull toward baseline each tick (>0 prevents flatline-of-success). */
  gamma: bigint;
}

/** Outcome of a single action in the resource phase (for driver legibility/debugging). */
export interface ActionResult {
  actor: string;
  /** original index in the input `actions` array (pre-canonical-sort). */
  index: number;
  accepted: boolean;
  /** present iff accepted === false. */
  reason?: string;
}

export { SCALE };
