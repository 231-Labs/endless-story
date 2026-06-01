// Step 1 scenarios: 2 performers contend for ONE capacity-1 resource — the partnership
// with 孟雲屏 (孟雲屏 is the SLOT, not an agent). Whoever holds it is 孟's stage partner;
// the other's `partner` desire necessarily reads target 0. Forced zero-sum (spec §4).
//
// We model three shapes to avoid single-scene overfit (brief Step 1: "run > 1 scenario"):
//   A. contested  — near-symmetric rivals trade the slot with legible escalation, budget
//                   spacing the flips into a slow legible rhythm (no thrash).
//   B. uneven     — one rival wants it far more; with a seize margin the weaker can never
//                   out-tense the holder → it settles (unrequited longing, not a flip-cycle).
//   C. naive      — ABLATION/negative control: no hysteresis, free grabs → oscillation
//                   reappears, proving margin+cost are load-bearing (Stage-2 ablation seed).

import { SCALE, type WorldState } from "../src/index.ts";
import type { PlannerConfig, Scenario, TuningConfig } from "../driver/types.ts";

const pct = (p: number): bigint => (BigInt(Math.round(p * 1000)) * SCALE) / 1000n;

const LIU = "柳生春";
const BAI = "白牡丹";
const SLOT = "partnership:孟雲屏";
const scheduleId = (agent: string): string => `schedule:${agent}`;

interface PerformerSpec {
  id: string;
  weight: bigint;
  baseline: bigint;
  volatility: bigint;
  s0: bigint;
  /** initial + capacity of this performer's schedule budget. */
  budgetCap: bigint;
  refill: bigint;
}

interface WorldSpec {
  performers: PerformerSpec[];
  /** initial holder of the slot, or undefined for an unheld (free) slot. */
  initialHolder?: string;
}

function makeWorld(spec: WorldSpec): () => WorldState {
  return () => {
    const resources: WorldState["resources"] = {
      [SLOT]: {
        id: SLOT,
        capacity: 1n,
        allocations: spec.initialHolder ? { [spec.initialHolder]: 1n } : {},
      },
    };
    for (const p of spec.performers) {
      resources[scheduleId(p.id)] = {
        id: scheduleId(p.id),
        capacity: p.budgetCap,
        allocations: { [p.id]: p.budgetCap },
        refill: { to: p.id, amount: p.refill },
      };
    }
    return {
      tick: 0n,
      resources,
      agents: spec.performers.map((p) => ({
        id: p.id,
        desires: [
          {
            id: "partner",
            statement: `要與孟雲屏搭戲（${p.id}）`,
            weight: p.weight,
            satisfaction: p.s0,
            baseline: p.baseline,
            volatility: p.volatility,
            draws_from: [{ resource_id: SLOT, claim: 1n }],
          },
        ],
      })),
    };
  };
}

// Shared satisfaction dynamics — loss aversion (alphaDown > alphaUp), mild habituation.
const TUNING: TuningConfig = {
  alphaUp: pct(0.3),
  alphaDown: pct(0.6),
  gamma: pct(0.05),
};

const basePlanner: PlannerConfig = {
  seizeMargin: pct(0.12),
  focusMargin: pct(0.15),
  actionCost: 3n,
  actThreshold: pct(0.3),
  scheduleResourceId: scheduleId,
};

// ---- A. contested rivalry --------------------------------------------------------------
// budget cap == action cost, refill 1/tick → a performer can re-seize only every ~budgetCap
// ticks. That sets the flip PERIOD: each reign lasts long enough for the holder to savour
// the slot (satisfaction climbs) while the loser stews to a tension spike before reclaiming
// it. Slow, legible rivalry — NOT argmax thrash.
export const contested: Scenario = {
  id: "partnership-contested",
  description: "near-symmetric rivals trade the 孟雲屏 slot; finite budget spaces flips into a legible rhythm",
  makeWorld: makeWorld({
    performers: [
      { id: LIU, weight: pct(0.82), baseline: pct(0.2), volatility: SCALE, s0: pct(0.2), budgetCap: 12n, refill: 1n },
      { id: BAI, weight: pct(0.8), baseline: pct(0.2), volatility: SCALE, s0: pct(0.2), budgetCap: 12n, refill: 1n },
    ],
  }),
  tuning: TUNING,
  planner: { ...basePlanner, actionCost: 12n, seizeMargin: pct(0.12) },
  horizon: 100,
  contestedResources: [SLOT],
};

// ---- B. uneven rivalry → resolution ----------------------------------------------------
export const uneven: Scenario = {
  id: "partnership-uneven",
  description: "柳生春 wants it far more; seize margin lets the holder keep it → unrequited longing, no flip-cycle",
  makeWorld: makeWorld({
    performers: [
      { id: LIU, weight: pct(0.9), baseline: pct(0.25), volatility: SCALE, s0: pct(0.2), budgetCap: 6n, refill: 1n },
      { id: BAI, weight: pct(0.35), baseline: pct(0.2), volatility: SCALE, s0: pct(0.2), budgetCap: 6n, refill: 1n },
    ],
  }),
  tuning: TUNING,
  // low cost so 柳生春 easily takes the free slot once; high seize margin so the weak rival
  // (max tension ≈ 0.34) can never clear holder+margin → it never flips back.
  planner: { ...basePlanner, actionCost: 3n, seizeMargin: pct(0.5) },
  horizon: 80,
  contestedResources: [SLOT],
};

// ---- C. naive ablation (negative control) ----------------------------------------------
export const naive: Scenario = {
  id: "partnership-naive-ablation",
  description: "no hysteresis (margin 0) + free grabs (cost 0) → oscillation reappears; proves the mechanisms",
  makeWorld: makeWorld({
    performers: [
      { id: LIU, weight: pct(0.8), baseline: pct(0.2), volatility: SCALE, s0: pct(0.2), budgetCap: 100n, refill: 100n },
      { id: BAI, weight: pct(0.8), baseline: pct(0.2), volatility: SCALE, s0: pct(0.2), budgetCap: 100n, refill: 100n },
    ],
  }),
  tuning: TUNING,
  planner: { ...basePlanner, seizeMargin: 0n, actionCost: 0n },
  horizon: 80,
  contestedResources: [SLOT],
};

export const STEP1_SCENARIOS: Scenario[] = [contested, uneven, naive];
export const constants = { LIU, BAI, SLOT, scheduleId, pct };
