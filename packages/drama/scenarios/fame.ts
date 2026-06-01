// Step 2 — the 柳生春 moment: intra-agent trade-off.
//
// Each performer now carries TWO desires drawing from TWO different capacity-1 resources:
//   - partner : 與孟雲屏搭戲   (draws from partnership:孟雲屏)
//   - fame    : 搶壓軸          (draws from spotlight:壓軸)
// Both are contested across the two performers (zero-sum), AND — crucially — both of a
// performer's desires are funded from that performer's ONE finite schedule budget. So
// chasing 壓軸 spends the budget that would have gone to defending 孟雲屏 partnership.
//
// The trade-off is NEVER declared. It is *derived* from the budget being finite: when the
// budget can fund only one pursuit per cycle, the performer is forced to neglect the other,
// and we watch the neglected desire's satisfaction slide. The emergent, legible "torn
// between two ambitions" moment is 柳生春's.
//
// Two variants prove it is budget-caused, not scripted:
//   scarce   — tight budget → forced-choice ticks pile up, focus alternates (the trade-off).
//   abundant — same world, fat budget → the performer funds BOTH every cycle, forced-choice
//              ~0. Removing the scarcity removes the trade-off. (Stage-2 ablation seed.)

import { SCALE, type WorldState } from "../src/index.ts";
import type { PlannerConfig, Scenario, TuningConfig } from "../driver/types.ts";

const pct = (p: number): bigint => (BigInt(Math.round(p * 1000)) * SCALE) / 1000n;

const LIU = "柳生春";
const BAI = "白牡丹";
const PARTNERSHIP = "partnership:孟雲屏";
const SPOTLIGHT = "spotlight:壓軸";
const scheduleId = (agent: string): string => `schedule:${agent}`;

interface PerformerSpec {
  id: string;
  partnerWeight: bigint;
  fameWeight: bigint;
  budgetCap: bigint;
  refill: bigint;
}

function makeWorld(performers: PerformerSpec[]): () => WorldState {
  return () => {
    const resources: WorldState["resources"] = {
      [PARTNERSHIP]: { id: PARTNERSHIP, capacity: 1n, allocations: {} },
      [SPOTLIGHT]: { id: SPOTLIGHT, capacity: 1n, allocations: {} },
    };
    for (const p of performers) {
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
      agents: performers.map((p) => ({
        id: p.id,
        desires: [
          {
            id: "partner",
            statement: `與孟雲屏搭戲（${p.id}）`,
            weight: p.partnerWeight,
            satisfaction: pct(0.2),
            baseline: pct(0.2),
            volatility: SCALE,
            draws_from: [{ resource_id: PARTNERSHIP, claim: 1n }],
          },
          {
            id: "fame",
            statement: `搶壓軸成角兒（${p.id}）`,
            weight: p.fameWeight,
            satisfaction: pct(0.2),
            baseline: pct(0.2),
            volatility: SCALE,
            draws_from: [{ resource_id: SPOTLIGHT, claim: 1n }],
          },
        ],
      })),
    };
  };
}

const TUNING: TuningConfig = { alphaUp: pct(0.3), alphaDown: pct(0.6), gamma: pct(0.05) };

const basePlanner: PlannerConfig = {
  seizeMargin: pct(0.12),
  focusMargin: pct(0.15),
  actionCost: 8n,
  actThreshold: pct(0.3),
  scheduleResourceId: scheduleId,
};

// 柳生春 is the protagonist of the trade-off; 白牡丹 is the FIXED rival that keeps poaching
// both slots, forcing 柳生春 to re-defend them. Crucial design point discovered while
// calibrating: the intra-agent budget trade-off only stays *live* under ongoing contention —
// holding a slot is free once acquired, so without a rival 柳生春 would simply grab both and
// rest. The trade-off is "I must re-seize BOTH every cycle but can only afford ONE". So the
// clean ablation varies ONLY 柳生春's budget and holds 白牡丹's poaching pressure constant.
const RIVAL_BAI: PerformerSpec = { id: BAI, partnerWeight: pct(0.82), fameWeight: pct(0.8), budgetCap: 8n, refill: 1n };
const liu = (budgetCap: bigint, refill: bigint): PerformerSpec => ({
  id: LIU,
  partnerWeight: pct(0.85),
  fameWeight: pct(0.82),
  budgetCap,
  refill,
});

// ---- scarce: the trade-off is live ----------------------------------------------------
// 柳生春 budget cap == cost, refill 1/tick → it can re-seize ~one slot per 8 ticks. With
// 白牡丹 poaching both, 柳生春 must pick which to reclaim each cycle → the other stays lost.
// The 柳生春 moment: torn between 陪孟雲屏排戲 and 搶壓軸, it cannot hold both.
export const scarce: Scenario = {
  id: "fame-scarce",
  description: "柳生春's two desires share one tight budget while 白牡丹 poaches both slots → emergent trade-off",
  makeWorld: makeWorld([liu(8n, 1n), RIVAL_BAI]),
  tuning: TUNING,
  planner: { ...basePlanner, actionCost: 8n },
  horizon: 120,
  contestedResources: [PARTNERSHIP, SPOTLIGHT],
};

// ---- abundant: ablation removing the scarcity -----------------------------------------
// SAME world & SAME 白牡丹 pressure; only 柳生春's budget is made abundant (refill ≥ 2×cost).
// Now 柳生春 can re-seize BOTH slots every tick, out-competing 白牡丹 → it holds both → the
// trade-off vanishes. The single changed variable is the budget, so the budget IS the cause.
export const abundant: Scenario = {
  id: "fame-abundant",
  description: "ablation: only 柳生春's budget made abundant → it funds both desires; trade-off vanishes",
  makeWorld: makeWorld([liu(64n, 64n), RIVAL_BAI]),
  tuning: TUNING,
  planner: { ...basePlanner, actionCost: 8n },
  horizon: 120,
  contestedResources: [PARTNERSHIP, SPOTLIGHT],
};

export const STEP2_SCENARIOS: Scenario[] = [scarce, abundant];
export const fameConstants = { LIU, BAI, PARTNERSHIP, SPOTLIGHT, scheduleId, pct };
