// Step 2 — the Liu moment: an EMERGENT intra-agent trade-off.
//
// Liu carries two desires (partner: rehearse with Meng; fame: grab the headliner slot) drawing
// from two different capacity-1 resources, both funded from its ONE finite schedule budget. Bai
// is a fixed rival that keeps poaching both slots, so Liu must re-seize to stay satisfied.
//
// The trade-off is never declared anywhere — no code says "you can't have both". It falls
// out of the budget being finite. We prove that by ABLATION: relax ONLY Liu's budget
// (single changed variable) and the trade-off disappears. If it were authored, it would
// survive the ablation. It does not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenario, analyze, analyzeTradeoff } from "../driver/index.ts";
import { scarce, abundant, fameConstants } from "../scenarios/index.ts";

const LIU = fameConstants.LIU;
const PART = fameConstants.PARTNERSHIP;
const SPOT = fameConstants.SPOTLIGHT;

// =========================================================================================
// The trade-off is present under a scarce budget
// =========================================================================================
test("scarce: 柳生春 is forced to choose — it can never satisfy both desires at once", () => {
  const r = runScenario(scarce);
  const t = analyzeTradeoff(r, LIU);
  assert.ok(t.forcedChoiceTicks > 30, `expected many forced-choice ticks, got ${t.forcedChoiceTicks}`);
  assert.equal(t.bothHighTicks, 0, "柳生春 must never hold both slots satisfied simultaneously");
});

test("scarce: 柳生春 is visibly torn — its focus alternates between the two desires", () => {
  const r = runScenario(scarce);
  const t = analyzeTradeoff(r, LIU);
  assert.ok(t.focusSwitches >= 6, `expected the focus to alternate (torn), got ${t.focusSwitches} switches`);
});

test("scarce: pursuing fame really does starve partnership (and vice versa) over the run", () => {
  // Whenever Liu holds the spotlight it must NOT also hold partnership — both are won by
  // spending the same budget, so they trade off tick by tick.
  const r = runScenario(scarce);
  let bothHeld = 0;
  for (const rec of r.trace) {
    if (rec.topHolder[PART] === LIU && rec.topHolder[SPOT] === LIU) bothHeld++;
  }
  assert.equal(bothHeld, 0, "with a scarce budget 柳生春 should never hold both slots at the same tick");
});

// =========================================================================================
// ABLATION: relax ONLY Liu's budget → the trade-off vanishes (so the budget caused it)
// =========================================================================================
test("ablation: relaxing ONLY 柳生春's budget removes the trade-off (scarce vs abundant)", () => {
  const s = analyzeTradeoff(runScenario(scarce), LIU);
  const a = analyzeTradeoff(runScenario(abundant), LIU);
  // The two discriminators of the trade-off, contrasted across the single-variable ablation:
  // forced choices collapse, and Liu goes from NEVER holding both satisfied to holding both
  // for most of the run. (focusSwitches stays similar — that's mere attention rotation, not
  // the trade-off; abundant still relabels its "focus" as the two tensions cross, even though
  // it funds both. The trade-off is about *funding*, which is what forcedChoice/bothHigh track.)
  assert.ok(s.forcedChoiceTicks > 30, `scarce should force choices constantly, got ${s.forcedChoiceTicks}`);
  assert.ok(a.forcedChoiceTicks < 10, `abundant should barely force choices (warmup only), got ${a.forcedChoiceTicks}`);
  assert.equal(s.bothHighTicks, 0, "scarce: 柳生春 never holds both slots satisfied");
  assert.ok(a.bothHighTicks > 50, `abundant: 柳生春 holds both satisfied for most of the run, got ${a.bothHighTicks}`);
});

test("ablation isolates the budget: scarce vs abundant differ ONLY in 柳生春's budget", () => {
  // The only difference between the two scenarios is Liu's schedule cap/refill. Same rival,
  // same tuning, same desires. So any behavioural difference is attributable to the budget.
  const sFn = scarce.makeWorld();
  const aFn = abundant.makeWorld();
  const liuSchedS = sFn.resources[`schedule:${LIU}`];
  const liuSchedA = aFn.resources[`schedule:${LIU}`];
  const baiSchedS = sFn.resources[`schedule:${fameConstants.BAI}`];
  const baiSchedA = aFn.resources[`schedule:${fameConstants.BAI}`];
  assert.notDeepEqual(
    { cap: liuSchedS.capacity, refill: liuSchedS.refill },
    { cap: liuSchedA.capacity, refill: liuSchedA.refill },
    "柳生春's budget must differ between scenarios",
  );
  assert.deepEqual(
    { cap: baiSchedS.capacity, refill: baiSchedS.refill },
    { cap: baiSchedA.capacity, refill: baiSchedA.refill },
    "白牡丹's budget (the rival pressure) must be identical in both",
  );
});

// =========================================================================================
// Step 2 must not introduce the failure modes either
// =========================================================================================
test("fame scenarios avoid flatline / runaway (drama stays alive with two desires)", () => {
  for (const s of [scarce, abundant]) {
    const a = analyze(runScenario(s));
    assert.equal(a.flatline, false, `${s.id} flatlined`);
    assert.equal(a.runaway, false, `${s.id} ran away into despair`);
  }
});

test("determinism: a two-desire run is byte-identical across executions", () => {
  const ser = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));
  assert.equal(ser(runScenario(scarce).finalWorld), ser(runScenario(scarce).finalWorld));
});
