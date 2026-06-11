// Decoupled verification of the dual-track death step (stepVitality), in ISOLATION from cohort
// payroll: the age-hazard track alone, the economic-death track alone, recovery+clamp, purity,
// and a parity check that the extracted step reproduces exactly what settleDay computes inline.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ECON,
  VIT_FULL,
  VIT_PT,
  settleDay,
  stepVitality,
  type CharState,
  type WorldEconState,
} from "../src/index.ts";
import { newChar } from "../driver/index.ts";
import { char } from "../scenarios/index.ts";
import { serialize } from "./helpers.ts";

const cfg = DEFAULT_ECON;

test("age track in isolation: solvent but past onset → vitality bleeds purely from age, then dies", () => {
  // age 70 vs onset 55 → over 15y → ageHazard = ageK(3) × 15000my = 45 pts/day, dwarfing +5 recovery.
  const c: CharState = newChar(char("elder", "老生", 60, 50, 50, 70, 0), 0n);
  const s1 = stepVitality(c, /*insolvent*/ false, cfg);
  assert.equal(s1.econDamage, 0n, "solvent → no economic damage (age track isolated)");
  assert.equal(s1.recovery, 5n * VIT_PT, "solvent → recovers");
  assert.equal(s1.ageHaz, 45n * VIT_PT, "age hazard = 3 × 15000 milli-years");
  assert.equal(s1.vitality, 60n * VIT_PT, "100 + 5 − 45 = 60");
  assert.equal(s1.insolventStreak, 0n);

  // walk it down: 60 → 20 → dead, never insolvent
  c.vitality = s1.vitality;
  c.vitality = stepVitality(c, false, cfg).vitality;
  assert.equal(c.vitality, 20n * VIT_PT);
  const s3 = stepVitality(c, false, cfg);
  assert.equal(s3.vitality, 0n, "clamped at floor");
  assert.equal(s3.dead, true, "age alone is fatal past onset");
});

test("economic track in isolation: insolvency streak accelerates damage; ~5 days from full kills", () => {
  // young + onset far away → ageHazard = 0, so only the economic track moves vitality.
  let c: CharState = newChar(char("broke", "小生", 60, 60, 60, 20, 100), 0n);
  const expected = [92n, 76n, 52n, 20n, 0n].map((v) => v * VIT_PT); // damage 8,16,24,32,40
  for (let day = 0; day < expected.length; day++) {
    const s = stepVitality(c, /*insolvent*/ true, cfg);
    assert.equal(s.ageHaz, 0n, "young → no age hazard (economic track isolated)");
    assert.equal(s.econDamage, cfg.econBase * BigInt(day + 1), "damage = econBase × streak (accelerating)");
    assert.equal(s.vitality, expected[day], `vitality on insolvent day ${day + 1}`);
    c = { ...c, vitality: s.vitality, insolventStreak: s.insolventStreak };
  }
  assert.equal(stepVitality(c, true, cfg).dead === false ? c.vitality : 0n, 0n, "dead by the 5th insolvent day");
});

test("recovery + streak reset: a solvent day heals and clears the insolvency streak", () => {
  const c: CharState = { ...newChar(char("conv", "小生", 60, 60, 60, 20, 100), 0n), vitality: 90n * VIT_PT, insolventStreak: 4n };
  const s = stepVitality(c, /*insolvent*/ false, cfg);
  assert.equal(s.insolventStreak, 0n, "solvent resets the streak");
  assert.equal(s.vitality, 95n * VIT_PT, "+5 recovery");

  const full: CharState = newChar(char("full", "小生", 60, 60, 60, 20, 100), 0n); // already at VIT_FULL
  assert.equal(stepVitality(full, false, cfg).vitality, VIT_FULL, "recovery clamps at full");
});

test("purity: stepVitality never mutates the character it reads", () => {
  const c: CharState = newChar(char("p", "小生", 60, 60, 60, 20, 0), 0n);
  const before = serialize(c);
  stepVitality(c, true, cfg);
  stepVitality(c, false, cfg);
  assert.equal(serialize(c), before, "input character must be untouched");
});

test("parity: the extracted step reproduces settleDay's inline vitality + streak exactly", () => {
  // single insolvent character (no subscribers → no salary; positive dailyCost → pay 0 < cost).
  const pre: CharState = newChar(char("solo", "小生", 60, 60, 60, 20, 100), 0n);
  const w: WorldEconState = {
    chars: [pre],
    accounts: { injected: 0n, ownerSink: 0n, storytellerSink: 0n, protocolSink: 0n, sagaTreasury: 0n },
    day: 0n,
  };
  const { next } = settleDay(w, cfg);
  const indep = stepVitality(pre, /*insolvent*/ true, cfg); // pre-increment livedDays, like settleDay
  assert.equal(next.chars[0].vitality, indep.vitality, "vitality must match settleDay");
  assert.equal(next.chars[0].insolventStreak, indep.insolventStreak, "streak must match settleDay");
});
