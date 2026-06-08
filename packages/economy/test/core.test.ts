// Step 0 — pure-core invariants. These are the load-bearing properties a Move port must also
// satisfy: conservation (no money created/destroyed), boundedness (vitality/balance domains),
// determinism (byte-for-byte reproducible), and a hand-computed golden vector (regression
// anchor + on-chain reference).

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ECON,
  VIT_FULL,
  conserves,
  settleDay,
  type CharConfig,
  type WorldEconState,
} from "../src/index.ts";
import { newChar, runScenario } from "../driver/index.ts";
import { ALL_SCENARIOS, char, thriving, world } from "../scenarios/index.ts";
import { lcg, serialize } from "./helpers.ts";

const CAST: CharConfig[] = [
  char("a", "花旦", 70, 85, 60, 22, 6),
  char("b", "小生", 65, 70, 75, 20, 3),
  char("c", "武生", 80, 60, 55, 24, -2),
];

test("conservation: injected === sinks + treasury + Σ balance after every settle", () => {
  let w = world(CAST)();
  const rand = lcg(11);
  assert.ok(conserves(w), "day 0 must conserve");
  for (let d = 0; d < 300; d++) {
    for (const c of w.chars) if (!c.dead) c.subscribers = BigInt(Math.floor(rand() * 11));
    w = settleDay(w, DEFAULT_ECON).next;
    assert.ok(conserves(w), `conservation broke on day ${w.day}`);
  }
});

test("bounded: vitality ∈ [0, VIT_FULL] and balance ≥ 0 after every settle", () => {
  let w = world(CAST)();
  const rand = lcg(7);
  for (let d = 0; d < 400; d++) {
    for (const c of w.chars) if (!c.dead) c.subscribers = BigInt(Math.floor(rand() * 6)); // thin income → stress
    w = settleDay(w, DEFAULT_ECON).next;
    for (const c of w.chars) {
      assert.ok(c.vitality >= 0n && c.vitality <= VIT_FULL, `vitality OOB: ${c.vitality}`);
      assert.ok(c.balance >= 0n, `balance negative: ${c.balance}`);
    }
  }
});

test("determinism: same scenario twice → byte-identical final world + trace", () => {
  const a = runScenario(thriving);
  const b = runScenario(thriving);
  assert.equal(serialize(a.finalWorld), serialize(b.finalWorld));
  assert.equal(serialize(a.trace), serialize(b.trace));
});

test("determinism: settleDay is a pure function (does not mutate input)", () => {
  const w = world(CAST)();
  for (const c of w.chars) c.subscribers = 5n;
  const before = serialize(w);
  settleDay(w, DEFAULT_ECON);
  assert.equal(serialize(w), before, "settleDay mutated its input");
});

test("golden vector: hand-computed single-day settle", () => {
  // 1 char, role base 8, attrs all 50 ⇒ attrModifier = 1.000, no slot, onset far away.
  const cfg: CharConfig = { id: "x", role: "小生", constitution: 50, appearance: 50, acuity: 50, ageYearsStart: 20, onsetMilliYears: 100_000n };
  const c = newChar(cfg, 56_000_000n); // seed 56 ENDLESS
  c.subscribers = 4n;
  const w: WorldEconState = {
    chars: [c],
    accounts: { injected: 56_000_000n, ownerSink: 0n, storytellerSink: 0n, protocolSink: 0n, sagaTreasury: 0n },
    day: 0n,
  };

  const { next, accounts } = (() => {
    const r = settleDay(w, DEFAULT_ECON);
    return { next: r.next, accounts: r.next.accounts };
  })();
  const nc = next.chars[0];

  // gross = 3·4 = 12; owner 20% = 2.4; storyteller 30% = 3.6; treasury 6.0
  // budget 6.0 < base 8.0 ⇒ salary prorated = 8·6/8 = 6.0 ⇒ balance 56+6 = 62
  // dailyCost = run 6 + mem 0.02·5 + seal 0.25·4 = 6 + 0.1 + 1.0 = 7.1 ⇒ balance 62 − 7.1 = 54.9
  assert.equal(nc.balance, 54_900_000n, "balance");
  // solvent ⇒ +5 recovery but clamped at full
  assert.equal(nc.vitality, VIT_FULL, "vitality clamped at full");
  assert.equal(nc.memoryCount, 11n, "memory 5 + 6 active");
  assert.equal(nc.livedDays, 1n, "lived 1 day");
  assert.equal(nc.dead, false);

  assert.equal(accounts.injected, 68_000_000n, "injected 56 + 12");
  assert.equal(accounts.ownerSink, 2_400_000n);
  assert.equal(accounts.storytellerSink, 3_600_000n);
  assert.equal(accounts.protocolSink, 7_100_000n);
  assert.equal(accounts.sagaTreasury, 0n);
  assert.ok(conserves(next), "golden state conserves");
});

test("conservation holds on every day of every shipped scenario", () => {
  for (const s of ALL_SCENARIOS) {
    assert.ok(runScenario(s).conservedEveryDay, `${s.id} broke conservation`);
  }
});
