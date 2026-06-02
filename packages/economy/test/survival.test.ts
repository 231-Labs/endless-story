// Lazy-settle survival snapshot — the web-facing bridge. Verifies the shadow model preserves
// the validated dynamics (subscribers fund survival; no readers → decline) and that lazy
// catch-up is split-invariant (settle in two steps == one shot) so reads are consistent.

import test from "node:test";
import assert from "node:assert/strict";
import { lazySettle, type SurvivalInput } from "../src/index.ts";

const base = { role: "小生", constitution: 60, appearance: 60, acuity: 60, ageYearsStart: 20 };

test("subscribed character accrues funds; reader-less drains and is worse off", () => {
  const sub: SurvivalInput = { ...base, memoryCount: 5, subscribers: 16, today: 60 };
  const none: SurvivalInput = { ...base, memoryCount: 5, subscribers: 0, today: 60 };
  const rich = lazySettle(null, sub).snapshot;
  const poor = lazySettle(null, none).snapshot;
  assert.ok(rich.funds > poor.funds, `subscribed should be richer: ${rich.funds} vs ${poor.funds}`);
  assert.ok(rich.netFlow > 0, "a well-subscribed character is net-positive");
  assert.ok(poor.netFlow < 0, "a reader-less character bleeds");
  assert.ok(poor.vitality < rich.vitality, "reader-less vitality should suffer");
});

test("reader-less character eventually dies (no immortality, mirrors H2)", () => {
  const none: SurvivalInput = { ...base, memoryCount: 5, subscribers: 0, today: 120 };
  const s = lazySettle(null, none).snapshot;
  assert.equal(s.dead, true, "120 days with no readers → dead");
  assert.equal(s.vitalityState, "dead");
});

test("lazy catch-up is split-invariant: settle(0→30) then (30→60) == settle(0→60)", () => {
  const at = (today: number): SurvivalInput => ({ ...base, role: "花旦", constitution: 70, appearance: 80, acuity: 60, memoryCount: 200, subscribers: 8, today });
  const oneShot = lazySettle(null, at(60)).next;
  const step1 = lazySettle(null, at(30));
  const step2 = lazySettle(step1.next, at(60)).next;
  assert.equal(step2.balanceMicro, oneShot.balanceMicro, "balance must match");
  assert.equal(step2.vitalityMilli, oneShot.vitalityMilli, "vitality must match");
  assert.equal(step2.settledDay, oneShot.settledDay);
});

test("snapshot fields are well-formed", () => {
  const s = lazySettle(null, { ...base, memoryCount: 300, subscribers: 6, today: 40 }).snapshot;
  assert.ok(s.vitality >= 0 && s.vitality <= 100);
  assert.ok(s.memoryRent > 0, "memory rent grows with stored memories");
  assert.ok(["critical", "low", "stable", "healthy"].includes(s.level));
  assert.ok(["birth", "growth", "golden", "aging", "decline"].includes(s.lifeStage));
  assert.equal(s.memoryCount, 300);
});
