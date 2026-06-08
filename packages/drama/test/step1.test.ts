// Step 1 — "minimal but dramatic": 2 performers contend for ONE capacity-1 partnership
// slot (Meng). These tests are the spec §8 failure-mode assertions made executable, plus
// the brief's Step 1 exit criteria:
//   - contention produces legible escalation (loser spikes → drives a counter-seize)
//   - tension tracks allocation (whoever lacks the slot is the tenser one)
//   - none of flatline / runaway / oscillation in the GOOD scenarios
//   - run > 1 scenario (contested + uneven), and an ABLATION proving the mechanism:
//     strip hysteresis + budget cost → oscillation reappears (spec §9 Stage-2 seed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenario, analyze, type RunResult } from "../driver/index.ts";
import { contested, uneven, naive, partnershipConstants } from "../scenarios/index.ts";
import { serialize } from "./helpers.ts";

const SLOT = partnershipConstants.SLOT;
const LIU = partnershipConstants.LIU;
const BAI = partnershipConstants.BAI;

/** mean tension of a performer's partner desire, split by whether it held the slot. */
function tensionByHolding(r: RunResult, agent: string): { holding: number; notHolding: number } {
  let hSum = 0,
    hN = 0,
    nSum = 0,
    nN = 0;
  for (const rec of r.trace) {
    const t = Number(rec.tension[agent]?.partner ?? 0n);
    if (rec.topHolder[SLOT] === agent) {
      hSum += t;
      hN++;
    } else {
      nSum += t;
      nN++;
    }
  }
  return { holding: hN ? hSum / hN : 0, notHolding: nN ? nSum / nN : 0 };
}

// =========================================================================================
// A. contested rivalry — the headline "legible escalation" scenario
// =========================================================================================
test("contested: no flatline / runaway / oscillation", () => {
  const a = analyze(runScenario(contested));
  assert.equal(a.flatline, false, "contention must produce a real tension swing");
  assert.equal(a.runaway, false, "must not collapse into a despair attractor");
  assert.equal(a.oscillation, false, `must trade legibly, not thrash (reign period ${a.lateReignPeriod})`);
});

test("contested: legible escalation occurs (a tension spike drives a seize)", () => {
  const a = analyze(runScenario(contested));
  assert.equal(a.legibleEscalation, true, "at least one seize must follow a >=0.70 tension spike");
});

test("contested: it is a genuine ongoing rivalry (slot keeps changing hands, but slowly)", () => {
  const a = analyze(runScenario(contested));
  assert.ok(a.totalFlips >= 4, `expected ongoing trading, got ${a.totalFlips} flips`);
  assert.ok(a.lateReignPeriod >= 4, `reign too short to be legible: ${a.lateReignPeriod}`);
});

test("contested: tension tracks allocation — whoever lacks the slot is tenser", () => {
  const r = runScenario(contested);
  for (const agent of [LIU, BAI]) {
    const { holding, notHolding } = tensionByHolding(r, agent);
    assert.ok(
      notHolding > holding,
      `${agent}: tension while not holding (${notHolding.toFixed(3)}) should exceed while holding (${holding.toFixed(3)})`,
    );
  }
});

// =========================================================================================
// B. uneven rivalry — second scenario (anti-overfit): resolves to unrequited longing
// =========================================================================================
test("uneven: no flatline / runaway / oscillation", () => {
  const a = analyze(runScenario(uneven));
  assert.equal(a.flatline, false);
  assert.equal(a.runaway, false);
  assert.equal(a.oscillation, false);
});

test("uneven: settles — the stronger desire wins and keeps the slot", () => {
  const r = runScenario(uneven);
  assert.equal(r.finalWorld.resources[SLOT].allocations[LIU], 1n, "柳生春 should hold the slot at the end");
  const a = analyze(r);
  assert.ok(a.lateReignPeriod === Infinity || a.lateFlips === 0, "no late-window flipping once settled");
});

test("uneven: the loser's longing stays unrequited (low, non-zero satisfaction, high tension)", () => {
  const r = runScenario(uneven);
  const last = r.trace[r.trace.length - 1];
  const baiSat = Number(last.satisfaction[BAI].partner) / 1e6;
  const baiTns = Number(last.tension[BAI].partner) / 1e6;
  assert.ok(baiSat < 0.1, `白牡丹 should stay starved of the slot (sat ${baiSat.toFixed(3)})`);
  assert.ok(baiTns > 0.25, `白牡丹 should stay tense / longing (tns ${baiTns.toFixed(3)})`);
});

// =========================================================================================
// C. naive ABLATION — proves the mechanism: remove hysteresis + budget cost → oscillation
// =========================================================================================
test("naive ablation: stripping margin + action cost makes oscillation REAPPEAR", () => {
  const a = analyze(runScenario(naive));
  assert.equal(a.oscillation, true, "without budget cost / margin the holder thrashes every tick");
  assert.ok(a.lateReignPeriod < 4, `expected fast thrash, reign period was ${a.lateReignPeriod}`);
});

// =========================================================================================
// Determinism of a full multi-tick run (driver + planner are pure too)
// =========================================================================================
test("determinism: a whole scenario run is byte-identical across two executions", () => {
  const a = runScenario(contested);
  const b = runScenario(contested);
  assert.equal(serialize(a.finalWorld), serialize(b.finalWorld));
  assert.equal(serialize(a.trace), serialize(b.trace));
});
