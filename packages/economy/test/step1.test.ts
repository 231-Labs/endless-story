// Step 1 — the 5 hypotheses that define "the mechanism actually works". Asserted against
// metrics, not vibes. If a constant change breaks the life cycle, one of these goes red.

import test from "node:test";
import assert from "node:assert/strict";

import { analyze, runScenario } from "../driver/index.ts";
import { allianceOff, allianceOn, mixedCohort, starving, thriving, vendor } from "../scenarios/index.ts";

test("H1 — a well-run troupe self-sustains: long healthy span + accrues wealth", () => {
  const a = analyze(runScenario(thriving));
  assert.ok(a.finalAlive > 0, "thriving cohort should still be alive through its golden era");
  assert.ok(a.lateHealthyFraction >= 0.6, `expected mostly healthy/stable, got ${a.lateHealthyFraction}`);
  assert.ok(a.finalMeanBalanceEndless > 56, `expected balance growth past seed 56, got ${a.finalMeanBalanceEndless}`);
});

test("H2 — no immortality: zero-subscriber characters all die (memory rent wins)", () => {
  const a = analyze(runScenario(starving));
  assert.ok(a.universalCollapse, `expected all dead, finalAlive=${a.finalAlive}`);
  assert.ok(a.meanLifespan > 0 && a.meanLifespan < starving.horizon, "deaths should be finite and within horizon");
});

test("H3 — generational turnover: births + deaths cycle, population neither 0 nor unbounded", () => {
  const a = analyze(runScenario(mixedCohort));
  assert.ok(a.turnover, `expected turnover, got deaths=${a.totalDeaths} births=${a.totalBirths} alive=${a.finalAlive}`);
  assert.ok(a.avgAliveLate >= 2, `expected a sustained population band, got avg ${a.avgAliveLate}`);
  assert.ok(a.minAliveLate >= 1, "population should never momentarily extinct in the late window");
});

test("H4 — alliances are causal: patronage lowers deaths / extends life vs the ablation", () => {
  const on = analyze(runScenario(allianceOn));
  const off = analyze(runScenario(allianceOff));
  assert.ok(on.totalRescues > 0, "alliance-on should perform patronage transfers");
  assert.ok(
    on.totalDeaths < off.totalDeaths || on.meanLifespan > off.meanLifespan,
    `alliance should help: deaths on=${on.totalDeaths} off=${off.totalDeaths}, lifespan on=${on.meanLifespan} off=${off.meanLifespan}`,
  );
});

test("H5 — no pathology: no universal collapse, no runaway wealth inequality", () => {
  const a = analyze(runScenario(mixedCohort));
  assert.ok(!a.universalCollapse, "cohort should not fully collapse");
  assert.ok(a.giniFinal < 0.9, `wealth too concentrated: gini ${a.giniFinal}`);
});

test("H6 — owner subsidy keeps a reader-less character alive at bounded, affordable cost", () => {
  const v = analyze(runScenario(vendor));
  assert.equal(v.finalAlive, 2, "all subsidized reader-less vendors should survive the horizon");
  assert.equal(v.totalDeaths, 0, "no economic death while the owner subsidizes");
  assert.ok(v.ownerBurnPerCharDayEndless > 0, "owner must actually be spending");
  // dormant gate (no readers ⇒ no POV inference) keeps the pet cheap — well below an active
  // character's dailyCost, and far below the subPrice it would take to self-fund.
  assert.ok(v.ownerBurnPerCharDayEndless < 12, `owner burn should stay affordable, got ${v.ownerBurnPerCharDayEndless}`);
});
