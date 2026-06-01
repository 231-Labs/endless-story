// The deterministic transition function — the core of the engine.
//
// Pure: (WorldState, Action[], TuningConfig) -> WorldState. Never mutates its inputs.
// Fixed-point bigint math only. Bounded-by-construction (no clamping). Identical inputs
// produce a byte-for-byte-identical next world on any machine (spec §3 Determinism) — the
// on-chain verifiability guarantee.
//
// Phase order (each phase is itself deterministic):
//   0. REFILL       — deterministic per-tick budget top-up (locked decision, brief §3.1),
//                     applied BEFORE actions so an agent spends *this* tick's budget.
//   1. RESOURCE     — validate + apply actions in canonical order; reject violators whole.
//   2. SATISFACTION — per agent, per desire: target from allocation, asymmetric relax,
//                     then habituation toward baseline.
//   (TENSION is DERIVED on read — never stored. See tension.ts.)
//
// Canonical action order (brief §3.5): sort by (tick, actor, index). All actions in one
// applyTick share `world.tick`, so the effective key is (actor, original-input-index).
// String comparison uses raw codepoint order (`<`), NOT localeCompare — locale ordering is
// not guaranteed identical across machines and would break determinism.

import { SCALE, ZERO, mulScale, mulDiv, bmin } from "./fixed.ts";
import type {
  Action,
  ActionResult,
  AgentState,
  Desire,
  Resource,
  TuningConfig,
  WorldState,
} from "./types.ts";

/** Structural deep clone of a world. bigints are immutable; we rebuild every container. */
function cloneWorld(world: WorldState): WorldState {
  const resources: Record<string, Resource> = {};
  for (const id of Object.keys(world.resources)) {
    const r = world.resources[id];
    const allocations: Record<string, bigint> = {};
    for (const a of Object.keys(r.allocations)) allocations[a] = r.allocations[a];
    resources[id] = {
      id: r.id,
      capacity: r.capacity,
      allocations,
      ...(r.refill ? { refill: { to: r.refill.to, amount: r.refill.amount } } : {}),
    };
  }
  const agents: AgentState[] = world.agents.map((ag) => ({
    id: ag.id,
    desires: ag.desires.map((d) => ({
      id: d.id,
      statement: d.statement,
      weight: d.weight,
      satisfaction: d.satisfaction,
      baseline: d.baseline,
      volatility: d.volatility,
      draws_from: d.draws_from.map((c) => ({ resource_id: c.resource_id, claim: c.claim })),
    })),
  }));
  return { agents, resources, tick: world.tick };
}

/** Sum of a resource's allocations. bigint addition is exact + commutative → order-free. */
function allocatedTotal(r: Resource): bigint {
  let sum = ZERO;
  for (const a of Object.keys(r.allocations)) sum += r.allocations[a];
  return sum;
}

const held = (r: Resource, agent: string): bigint => r.allocations[agent] ?? ZERO;

// ---------------------------------------------------------------------------------------
// Phase 0: REFILL
// ---------------------------------------------------------------------------------------
function applyRefill(resources: Record<string, Resource>): void {
  for (const id of Object.keys(resources)) {
    const r = resources[id];
    if (!r.refill) continue;
    const current = held(r, r.refill.to);
    // headroom so the top-up never breaks conservation: cap at capacity minus everyone
    // else's holdings.
    const others = allocatedTotal(r) - current;
    const maxForHolder = r.capacity - others;
    r.allocations[r.refill.to] = bmin(maxForHolder, current + r.refill.amount);
  }
}

// ---------------------------------------------------------------------------------------
// Phase 1: RESOURCE (validate + apply, canonical order, atomic per action)
// ---------------------------------------------------------------------------------------
function canonicalOrder(actions: Action[]): { action: Action; index: number }[] {
  const tagged = actions.map((action, index) => ({ action, index }));
  tagged.sort((a, b) => {
    if (a.action.actor < b.action.actor) return -1;
    if (a.action.actor > b.action.actor) return 1;
    return a.index - b.index; // (tick, actor, index): tick is constant within a tick
  });
  return tagged;
}

/**
 * Apply one action against `resources`, atomically. Returns ok:true if applied; on any
 * infeasibility returns ok:false with a reason and leaves `resources` UNTOUCHED. We mutate
 * scratch copies of only the touched resources, validate, then commit.
 */
function tryApplyAction(
  resources: Record<string, Resource>,
  action: Action,
): { ok: true } | { ok: false; reason: string } {
  const scratch: Record<string, Resource> = {};
  const ensure = (rid: string): Resource | undefined => {
    if (scratch[rid]) return scratch[rid];
    const r = resources[rid];
    if (!r) return undefined;
    const allocations: Record<string, bigint> = {};
    for (const a of Object.keys(r.allocations)) allocations[a] = r.allocations[a];
    scratch[rid] = { id: r.id, capacity: r.capacity, allocations, refill: r.refill };
    return scratch[rid];
  };

  // transfers first, then costs (fixed order for determinism)
  for (const t of action.transfers) {
    if (t.amount < ZERO) return { ok: false, reason: `negative transfer amount on ${t.resource_id}` };
    const r = ensure(t.resource_id);
    if (!r) return { ok: false, reason: `unknown resource ${t.resource_id}` };
    if (t.amount === ZERO) continue;
    if (t.from !== undefined) {
      const have = held(r, t.from);
      if (have < t.amount) {
        return { ok: false, reason: `${t.from} holds ${have} < ${t.amount} of ${t.resource_id}` };
      }
      // moving units keeps the total constant → conservation trivially preserved
      r.allocations[t.from] = have - t.amount;
      r.allocations[t.to] = held(r, t.to) + t.amount;
    } else {
      // draw from the free pool: total rises and must stay within capacity
      const after = allocatedTotal(r) + t.amount;
      if (after > r.capacity) {
        return {
          ok: false,
          reason: `transfer to ${t.to} exceeds capacity of ${t.resource_id} (${after} > ${r.capacity})`,
        };
      }
      r.allocations[t.to] = held(r, t.to) + t.amount;
    }
  }

  for (const c of action.cost) {
    if (c.amount < ZERO) return { ok: false, reason: `negative cost on ${c.resource_id}` };
    const r = ensure(c.resource_id);
    if (!r) return { ok: false, reason: `unknown cost resource ${c.resource_id}` };
    if (c.amount === ZERO) continue;
    const have = held(r, action.actor);
    if (have < c.amount) {
      return { ok: false, reason: `${action.actor} budget ${have} < cost ${c.amount} of ${c.resource_id}` };
    }
    // consume: units leave the allocation (total drops; conservation `sum ≤ cap` still holds)
    r.allocations[action.actor] = have - c.amount;
  }

  for (const rid of Object.keys(scratch)) {
    resources[rid].allocations = scratch[rid].allocations;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Phase 2: SATISFACTION (per agent, per desire)
// ---------------------------------------------------------------------------------------
/** target = SCALE * held / want, derived purely from current allocation. ∈ [0, SCALE]. */
function targetSatisfaction(
  resources: Record<string, Resource>,
  agent: string,
  desire: Desire,
): bigint {
  let heldSum = ZERO;
  let wantSum = ZERO;
  for (const claim of desire.draws_from) {
    const r = resources[claim.resource_id];
    const have = r ? held(r, agent) : ZERO;
    heldSum += bmin(have, claim.claim); // holding more than you want adds nothing
    wantSum += claim.claim;
  }
  if (wantSum === ZERO) return SCALE; // a desire that wants nothing is vacuously satisfied
  return mulDiv(SCALE, heldSum, wantSum); // ≤ SCALE since heldSum ≤ wantSum
}

/** Evolve one desire's satisfaction: asymmetric relaxation, then habituation. Bounded. */
function relaxDesire(
  s: bigint,
  target: bigint,
  baseline: bigint,
  volatility: bigint,
  cfg: TuningConfig,
): bigint {
  // asymmetric relaxation (loss aversion): drops use alphaDown > alphaUp
  const alpha = target >= s ? cfg.alphaUp : cfg.alphaDown;
  const rate = mulScale(alpha, volatility); // alpha*volatility/SCALE ∈ [0, SCALE]
  // signed convex step; truncation toward zero never overshoots `target` (see fixed.ts)
  const relaxed = s + mulScale(rate, target - s);
  // habituation: slow pull toward baseline so nothing stays sated (or starved) forever
  return relaxed + mulScale(cfg.gamma, baseline - relaxed);
}

// ---------------------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------------------
export interface TickOutcome {
  world: WorldState;
  /** per-action accept/reject, in canonical (applied) order, for legibility & calibration. */
  results: ActionResult[];
}

/** Verbose transition: next world + per-action results. `applyTick` wraps this. */
export function applyTickVerbose(
  world: WorldState,
  actions: Action[],
  cfg: TuningConfig,
): TickOutcome {
  const next = cloneWorld(world);

  // 0. REFILL
  applyRefill(next.resources);

  // 1. RESOURCE
  const results: ActionResult[] = [];
  for (const { action, index } of canonicalOrder(actions)) {
    const res = tryApplyAction(next.resources, action);
    results.push(
      res.ok
        ? { actor: action.actor, index, accepted: true }
        : { actor: action.actor, index, accepted: false, reason: res.reason },
    );
  }

  // 2. SATISFACTION
  for (const agent of next.agents) {
    for (const desire of agent.desires) {
      const target = targetSatisfaction(next.resources, agent.id, desire);
      desire.satisfaction = relaxDesire(
        desire.satisfaction,
        target,
        desire.baseline,
        desire.volatility,
        cfg,
      );
    }
  }

  next.tick = world.tick + 1n;
  return { world: next, results };
}

/**
 * The canonical spec transition: (WorldState, Action[], TuningConfig) -> WorldState.
 * Pure, deterministic, bounded-without-clamp. Re-run it off committed state + actions to
 * reproduce the exact next world (and thus tension).
 */
export function applyTick(world: WorldState, actions: Action[], cfg: TuningConfig): WorldState {
  return applyTickVerbose(world, actions, cfg).world;
}
