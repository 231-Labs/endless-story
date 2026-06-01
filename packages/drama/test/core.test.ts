// Step 0 — pure-core unit tests:
//   1. Conservation        — sum(allocations) ≤ capacity always; violators rejected whole.
//   2. Bounded-without-clamp — satisfaction stays in [0, SCALE] by construction.
//   3. Determinism         — same (world, actions, cfg) → byte-identical next world; inputs
//                            never mutated.
//   4. Golden vector       — a hand-computed (world, actions) → exact next world, the
//                            regression anchor + the on-chain "re-run to verify" reference.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCALE,
  applyTick,
  applyTickVerbose,
  isScaled,
  tension,
  type Action,
  type Resource,
  type TuningConfig,
  type WorldState,
} from "../src/index.ts";
import { TUNING, serialize, lcg, scaledFrom } from "./helpers.ts";

// ---- small builders ---------------------------------------------------------------------
function oneDesireWorld(opts: {
  alloc?: bigint;
  capacity?: bigint;
  claim?: bigint;
  s?: bigint;
  baseline?: bigint;
  volatility?: bigint;
  weight?: bigint;
  refill?: { to: string; amount: bigint };
}): WorldState {
  const cap = opts.capacity ?? 1n;
  const allocations: Record<string, bigint> = {};
  if (opts.alloc !== undefined) allocations["A"] = opts.alloc;
  const resource: Resource = { id: "R", capacity: cap, allocations };
  if (opts.refill) resource.refill = opts.refill;
  return {
    tick: 0n,
    resources: { R: resource },
    agents: [
      {
        id: "A",
        desires: [
          {
            id: "d",
            statement: "wants R",
            weight: opts.weight ?? SCALE,
            satisfaction: opts.s ?? 0n,
            baseline: opts.baseline ?? 200_000n,
            volatility: opts.volatility ?? SCALE,
            draws_from: [{ resource_id: "R", claim: opts.claim ?? 1n }],
          },
        ],
      },
    ],
  };
}

const acquireR = (actor: string, amount = 1n): Action => ({
  actor,
  transfers: [{ resource_id: "R", to: actor, amount }],
  cost: [],
});

// =========================================================================================
// 1. CONSERVATION
// =========================================================================================
test("conservation: a transfer that would exceed capacity is rejected, state untouched", () => {
  const world = oneDesireWorld({ capacity: 1n });
  const before = serialize(world.resources);
  const { world: next, results } = applyTickVerbose(world, [acquireR("A", 2n)], TUNING);

  assert.equal(results.length, 1);
  assert.equal(results[0].accepted, false, "over-capacity transfer must be rejected");
  // resource state must be exactly as before (no partial application)
  assert.equal(serialize(next.resources.R.allocations), serialize({}));
  // input world never mutated
  assert.equal(serialize(world.resources), before);
});

test("conservation: sum(allocations) ≤ capacity after any accepted action", () => {
  // two agents both grab a capacity-1 slot from the free pool in the same tick.
  const world: WorldState = {
    tick: 0n,
    resources: { slot: { id: "slot", capacity: 1n, allocations: {} } },
    agents: [
      { id: "A", desires: [] },
      { id: "B", desires: [] },
    ],
  };
  const grab = (a: string): Action => ({
    actor: a,
    transfers: [{ resource_id: "slot", to: a, amount: 1n }],
    cost: [],
  });
  const { world: next, results } = applyTickVerbose(world, [grab("A"), grab("B")], TUNING);

  const total = Object.values(next.resources.slot.allocations).reduce((s, v) => s + v, 0n);
  assert.ok(total <= next.resources.slot.capacity, "conservation invariant must hold");
  // exactly one winner (canonical order: A before B); B is rejected because slot is full
  assert.equal(results.find((r) => r.actor === "A")?.accepted, true);
  assert.equal(results.find((r) => r.actor === "B")?.accepted, false);
  assert.equal(next.resources.slot.allocations["A"], 1n);
});

test("conservation: a cost the actor cannot afford rejects the whole action", () => {
  const world: WorldState = {
    tick: 0n,
    resources: {
      slot: { id: "slot", capacity: 1n, allocations: {} },
      budget: { id: "budget", capacity: 10n, allocations: { A: 1n } },
    },
    agents: [{ id: "A", desires: [] }],
  };
  // action would grab the slot but costs 5 budget; A only has 1 → reject, slot untouched.
  const action: Action = {
    actor: "A",
    transfers: [{ resource_id: "slot", to: "A", amount: 1n }],
    cost: [{ resource_id: "budget", amount: 5n }],
  };
  const { world: next, results } = applyTickVerbose(world, [action], TUNING);
  assert.equal(results[0].accepted, false);
  assert.equal(next.resources.slot.allocations["A"], undefined, "slot must NOT be taken");
  assert.equal(next.resources.budget.allocations["A"], 1n, "budget must NOT be debited");
});

// =========================================================================================
// 2. BOUNDED WITHOUT CLAMP
// =========================================================================================
test("bounded: satisfaction stays in [0, SCALE] across a long adversarial run", () => {
  // sweep edge tunings + start states + flip allocation on/off each tick to drive target
  // between 0 and SCALE. There is NO clamp in the engine; bounds must hold by construction.
  const tunings: TuningConfig[] = [
    { alphaUp: 1n, alphaDown: SCALE, gamma: SCALE }, // extreme: max down + max habituation
    { alphaUp: SCALE, alphaDown: SCALE, gamma: 0n }, // instant snap, no habituation
    { alphaUp: SCALE, alphaDown: SCALE, gamma: SCALE }, // everything maxed
    TUNING,
  ];
  const starts = [0n, 1n, 499_999n, 999_999n, SCALE];
  const rand = lcg(12345);

  for (const cfg of tunings) {
    for (const s0 of starts) {
      let world = oneDesireWorld({ s: s0, baseline: scaledFrom(rand()), volatility: SCALE });
      for (let t = 0; t < 400; t++) {
        const hold = rand() < 0.5; // flip whether A holds the slot → target flips 0↔SCALE
        const action: Action = hold
          ? acquireR("A", 1n)
          : { actor: "A", transfers: [{ resource_id: "R", from: "A", to: "free", amount: 1n }], cost: [] };
        world = applyTick(world, [action], cfg);
        const s = world.agents[0].desires[0].satisfaction;
        assert.ok(isScaled(s), `satisfaction ${s} left [0,SCALE] at tick ${t} (cfg ${serialize(cfg)})`);
        assert.ok(isScaled(tension(world.agents[0].desires[0])), "tension must also stay bounded");
      }
    }
  }
});

test("bounded: max rate snaps exactly to target without overshoot", () => {
  // alpha=SCALE, volatility=SCALE, gamma=0 → relaxed = target exactly, then no habituation.
  const cfg: TuningConfig = { alphaUp: SCALE, alphaDown: SCALE, gamma: 0n };
  const world = oneDesireWorld({ s: 0n, alloc: 1n, claim: 1n }); // target = SCALE
  const next = applyTick(world, [], cfg);
  assert.equal(next.agents[0].desires[0].satisfaction, SCALE, "should reach exactly SCALE, not exceed");
});

// =========================================================================================
// 3. DETERMINISM
// =========================================================================================
test("determinism: identical inputs → byte-identical next world", () => {
  const make = () => oneDesireWorld({ s: 123_456n, alloc: 1n, baseline: 333_333n });
  const actions: Action[] = [acquireR("A", 0n)]; // no-op transfer, still exercises phases
  const a = applyTick(make(), actions, TUNING);
  const b = applyTick(make(), actions, TUNING);
  assert.equal(serialize(a), serialize(b));
});

test("determinism: applyTick does not mutate its input world or actions", () => {
  const world = oneDesireWorld({ s: 500_000n, alloc: 1n });
  const snapshot = serialize(world);
  const actions: Action[] = [acquireR("A", 0n)];
  const actionsSnapshot = serialize(actions);
  applyTick(world, actions, TUNING);
  assert.equal(serialize(world), snapshot, "input world must be unchanged");
  assert.equal(serialize(actions), actionsSnapshot, "input actions must be unchanged");
});

test("determinism: canonical order is independent of input action order", () => {
  // Two agents contend for one slot. Whatever order the driver lists them, the canonical
  // (actor, index) sort must produce the same winner (A < B by codepoint).
  const base: WorldState = {
    tick: 0n,
    resources: { slot: { id: "slot", capacity: 1n, allocations: {} } },
    agents: [
      { id: "A", desires: [] },
      { id: "B", desires: [] },
    ],
  };
  const gA: Action = { actor: "A", transfers: [{ resource_id: "slot", to: "A", amount: 1n }], cost: [] };
  const gB: Action = { actor: "B", transfers: [{ resource_id: "slot", to: "B", amount: 1n }], cost: [] };
  const r1 = applyTick(structuredClone(base), [gA, gB], TUNING);
  const r2 = applyTick(structuredClone(base), [gB, gA], TUNING);
  assert.equal(serialize(r1.resources), serialize(r2.resources));
  assert.equal(r1.resources.slot.allocations["A"], 1n);
});

// =========================================================================================
// 4. GOLDEN VECTOR  (hand-computed; see comment for the arithmetic)
// =========================================================================================
test("golden vector: one tick reproduces the exact hand-computed next world", () => {
  // World: agent A, desire d (weight=SCALE, s=0, baseline=200000, volatility=SCALE,
  //        draws_from R claim 1). Resource R capacity 1, nobody holding. No refill.
  // Action: A draws 1 unit of R from the free pool.
  // Tuning: alphaUp=300000, alphaDown=700000, gamma=50000.
  //
  // REFILL:        none.
  // RESOURCE:      free pool → A: allocatedTotal 0, after 1 ≤ cap 1 → accept. R.alloc.A = 1.
  // SATISFACTION:  held = min(1,1)=1; want=1; target = SCALE*1/1 = 1_000_000.
  //                target(1e6) ≥ s(0) → alpha = alphaUp = 300_000.
  //                rate     = 300000*1000000/1000000 = 300_000.
  //                relaxed  = 0 + 300000*(1000000-0)/1000000 = 300_000.
  //                habituation: relaxed + gamma*(baseline-relaxed)/SCALE
  //                           = 300000 + 50000*(200000-300000)/1000000
  //                           = 300000 + (50000*-100000)/1000000
  //                           = 300000 + (-5_000_000_000 / 1_000_000)  [trunc toward 0]
  //                           = 300000 - 5000 = 295_000.
  // tension(d)   = weight*(SCALE-s)/SCALE = 1000000*(1000000-295000)/1000000 = 705_000.
  // tick         = 1.
  const cfg: TuningConfig = { alphaUp: 300_000n, alphaDown: 700_000n, gamma: 50_000n };
  const world = oneDesireWorld({ capacity: 1n, claim: 1n, s: 0n, baseline: 200_000n, weight: SCALE });
  const next = applyTick(world, [acquireR("A", 1n)], cfg);

  assert.equal(next.tick, 1n);
  assert.equal(next.resources.R.allocations["A"], 1n);
  assert.equal(next.agents[0].desires[0].satisfaction, 295_000n);
  assert.equal(tension(next.agents[0].desires[0]), 705_000n);

  // Full structural golden snapshot (the on-chain "re-run to verify" reference).
  const golden = {
    tick: "1n",
    resources: { R: { id: "R", capacity: "1n", allocations: { A: "1n" } } },
    agents: [
      {
        id: "A",
        desires: [
          {
            id: "d",
            statement: "wants R",
            weight: "1000000n",
            satisfaction: "295000n",
            baseline: "200000n",
            volatility: "1000000n",
            draws_from: [{ resource_id: "R", claim: "1n" }],
          },
        ],
      },
    ],
  };
  assert.equal(serialize(next), serialize(golden));
});

test("golden vector: refill tops up to capacity, never beyond (conservation under refill)", () => {
  // budget resource capacity 5, A holds 2, refill +4 → min(5, 2+4)=5 (capped, not 6).
  const world: WorldState = {
    tick: 0n,
    resources: { budget: { id: "budget", capacity: 5n, allocations: { A: 2n }, refill: { to: "A", amount: 4n } } },
    agents: [{ id: "A", desires: [] }],
  };
  const next = applyTick(world, [], TUNING);
  assert.equal(next.resources.budget.allocations["A"], 5n);
  const total = Object.values(next.resources.budget.allocations).reduce((s, v) => s + v, 0n);
  assert.ok(total <= next.resources.budget.capacity);
});
