// Cross-layer conformance: the off-chain applyTick must compute the SAME allocation result
// that the on-chain Move ledger produces for the same (Liu holds cap-1 slot → Bai seizes) beat.
//
// This is the last link of the E2E claim "anyone can re-run and get the same tension":
//   - Move side (contracts: tests/drama_e2e.move) settles the ledger on-chain: Liu=0, Bai=1, total=1.
//   - TS side (here) runs the SAME transfer through applyTick's RESOURCE PHASE and must land on
//     the byte-identical allocation, then derives tension from it (SATISFACTION PHASE).
// If these two ever diverge, the "verifiable" story breaks — so this test is the guard rail.
//
// The numbers here are pinned to the Move E2E test on purpose (capacity 1, seize amount 1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTick, applyTickVerbose } from "../src/applyTick.ts";
import { tension } from "../src/tension.ts";
import { SCALE } from "../src/fixed.ts";
import type { WorldState, Action, TuningConfig } from "../src/types.ts";

const LIU = "柳生春";
const BAI = "白牡丹";
const SLOT = "partnership:孟雲屏";

// Same tuning the simulator/product commit to (must be committed alongside state per WRITEUP §2).
const TUNING: TuningConfig = { alphaUp: 300_000n, alphaDown: 600_000n, gamma: 50_000n };

// World mirroring the Move E2E start state: capacity-1 slot, Liu holds it; both performers
// carry a `partner` desire drawing 1 unit from the slot.
function startWorld(): WorldState {
  const partnerDesire = (s: bigint) => ({
    id: "partner",
    statement: "與孟雲屏搭戲",
    weight: SCALE,
    satisfaction: s,
    baseline: 200_000n,
    volatility: SCALE,
    draws_from: [{ resource_id: SLOT, claim: 1n }],
  });
  return {
    tick: 0n,
    resources: {
      [SLOT]: { id: SLOT, capacity: 1n, allocations: { [LIU]: 1n } }, // Liu holds it
    },
    agents: [
      { id: LIU, desires: [partnerDesire(900_000n)] }, // Liu currently satisfied (holds slot)
      { id: BAI, desires: [partnerDesire(50_000n)] }, // Bai starved (doesn't hold it)
    ],
  };
}

// The seize: Bai takes the 1 unit of the slot from Liu — identical to the Move E2E's
// ResourceTransferOp{ from: Liu, to: Bai, amount: 1 }.
const seizeAction: Action = {
  actor: BAI,
  transfers: [{ resource_id: SLOT, from: LIU, to: BAI, amount: 1n }],
  cost: [],
};

test("conformance: TS RESOURCE PHASE produces the SAME ledger as the Move on-chain seize", () => {
  const next = applyTick(startWorld(), [seizeAction], TUNING);
  const slot = next.resources[SLOT];
  // byte-for-byte the same allocation the Move ledger lands on (tests/drama_e2e.move asserts these exact values)
  assert.equal(slot.allocations[LIU] ?? 0n, 0n, "柳 must have lost the slot (== Move 柳=0)");
  assert.equal(slot.allocations[BAI] ?? 0n, 1n, "白 must now hold the slot (== Move 白=1)");
  const total = Object.values(slot.allocations).reduce((s, v) => s + v, 0n);
  assert.equal(total, 1n, "conservation: still exactly 1 unit in play (== Move total=1)");
  assert.ok(total <= slot.capacity, "sum(allocations) <= capacity");
});

test("conformance: the seize is rejected whole if it would break conservation (atomic-reject mirror)", () => {
  // Bai tries to take 2 from Liu who only holds 1 → the WHOLE action is rejected, ledger untouched.
  const overReach: Action = {
    actor: BAI,
    transfers: [{ resource_id: SLOT, from: LIU, to: BAI, amount: 2n }],
    cost: [],
  };
  const { world: next, results } = applyTickVerbose(startWorld(), [overReach], TUNING);
  assert.equal(results[0].accepted, false, "infeasible transfer must be rejected (== Move abort)");
  // ledger unchanged: Liu still holds it
  assert.equal(next.resources[SLOT].allocations[LIU] ?? 0n, 1n, "rejected action leaves 柳 holding the slot");
  assert.equal(next.resources[SLOT].allocations[BAI] ?? 0n, 0n, "白 gained nothing");
});

test("conformance: tension responds to the seize in the right direction (the affect the chain enables)", () => {
  // SATISFACTION PHASE reads the on-chain allocation result and evolves felt state. The
  // meaningful causal claim is DIRECTIONAL: losing the slot makes Liu tenser than it was,
  // winning it makes Bai less tense than it was. (We do NOT claim Liu > Bai in absolute terms —
  // with loss aversion + different start states the absolute ordering depends on history;
  // that's a feature, asserting it would be wrong.)
  const before = startWorld();
  const liuBefore = tension(before.agents.find((a) => a.id === LIU)!.desires[0]);
  const baiBefore = tension(before.agents.find((a) => a.id === BAI)!.desires[0]);

  const next = applyTick(startWorld(), [seizeAction], TUNING);
  const liuAfter = tension(next.agents.find((a) => a.id === LIU)!.desires[0]);
  const baiAfter = tension(next.agents.find((a) => a.id === BAI)!.desires[0]);

  assert.ok(liuAfter > liuBefore, `柳 lost the slot → its tension must RISE: ${liuBefore} → ${liuAfter}`);
  assert.ok(baiAfter < baiBefore, `白 won the slot → its tension must FALL: ${baiBefore} → ${baiAfter}`);

  // loss aversion check: Liu's rise (fast, alphaDown) should out-magnitude Bai's fall (slow, alphaUp)
  const liuRise = liuAfter - liuBefore;
  const baiFall = baiBefore - baiAfter;
  assert.ok(liuRise > baiFall,
    `loss aversion: the loser's pain (Δ${liuRise}) should exceed the winner's relief (Δ${baiFall})`);

  // determinism: re-running the exact same beat yields byte-identical tension (re-run guarantee).
  const again = applyTick(startWorld(), [seizeAction], TUNING);
  const liuAgain = tension(again.agents.find((a) => a.id === LIU)!.desires[0]);
  assert.equal(liuAgain, liuAfter, "re-run must reproduce the exact same tension (byte-identical)");
});
