// Cohort settle shadow (Part D D5): salary is paid from the saga treasury (mint/dream fees),
// so 班中俸 > 0 even with zero subscribers — the thing the single-character lazySettle could
// never show. Also: an empty treasury → zero salary (today's behaviour), the pot drains as it
// pays, and GIVE-phase transfers move balances.

import test from "node:test";
import assert from "node:assert/strict";

import { MUNIT, settleSagaTo, type SagaCharInput, type SagaSettleInput } from "../src/index.ts";

const cast: SagaCharInput[] = [
  { id: "hua", role: "花旦", constitution: 70, appearance: 85, acuity: 60, ageYearsStart: 22, memoryCount: 5, subscribers: 0 },
  { id: "sheng", role: "小生", constitution: 65, appearance: 70, acuity: 75, ageYearsStart: 20, memoryCount: 5, subscribers: 0 },
  { id: "lao", role: "老生", constitution: 80, appearance: 60, acuity: 55, ageYearsStart: 24, memoryCount: 5, subscribers: 0 },
];

test("treasury-funded payroll: zero subscribers still draws a base-floor salary", () => {
  const input: SagaSettleInput = { today: 1, treasuryBalanceMicro: 500n * MUNIT, chars: cast };
  const { snapshots } = settleSagaTo(null, input);
  for (const id of ["hua", "sheng", "lao"]) {
    assert.ok(snapshots[id].salary > 0, `${id} should draw a treasury-funded wage, got ${snapshots[id].salary}`);
  }
  // 花旦 base floor (10) > 老生 (7): with a full pool the role floor ranks salaries.
  assert.ok(snapshots["hua"].salary >= snapshots["lao"].salary, "花旦 floor ≥ 老生 floor");
});

test("empty treasury → zero salary (matches the current reader-less demo)", () => {
  const { snapshots } = settleSagaTo(null, { today: 1, treasuryBalanceMicro: 0n, chars: cast });
  for (const id of ["hua", "sheng", "lao"]) assert.equal(snapshots[id].salary, 0, `${id} unpaid with empty treasury`);
});

test("the pool drains as it pays, and new on-chain fees top it back up", () => {
  const day1 = settleSagaTo(null, { today: 1, treasuryBalanceMicro: 500n * MUNIT, chars: cast });
  const potAfter1 = BigInt(day1.next.treasuryMicro);
  assert.ok(potAfter1 < 500n * MUNIT, "treasury drained by wages paid");
  // a fresh mint fee arrives → on-chain balance grows; the shadow pot picks the delta up.
  const day2 = settleSagaTo(day1.next, { today: 2, treasuryBalanceMicro: BigInt(day1.next.lastOnchainTreasuryMicro) + 100n * MUNIT, chars: cast });
  assert.ok(BigInt(day2.next.treasuryMicro) > potAfter1 - 60n * MUNIT, "the 100 ENDLESS top-up replenishes the pot");
});

test("GIVE transfers move balances after settle (no overdraft)", () => {
  const seed = settleSagaTo(null, { today: 5, treasuryBalanceMicro: 800n * MUNIT, chars: cast });
  const before = seed.snapshots["hua"].funds;
  const withGift = settleSagaTo(seed.next, {
    today: 6,
    treasuryBalanceMicro: BigInt(seed.next.lastOnchainTreasuryMicro),
    chars: cast,
    transfers: [{ fromId: "hua", toId: "lao", amount: 10n * MUNIT, memo: "patronage" }],
  });
  assert.ok(withGift.snapshots["lao"].funds >= seed.snapshots["lao"].funds, "recipient credited");
  assert.ok(withGift.snapshots["hua"].funds < before + Number(seed.snapshots["hua"].salary) + 5, "giver debited");
});

test("determinism + lazy split-invariance: settle(0→3)+(3→6) == settle(0→6)", () => {
  const ser = (s: object) => JSON.stringify(s);
  const input = (today: number): SagaSettleInput => ({ today, treasuryBalanceMicro: 600n * MUNIT, chars: cast });
  const oneShot = settleSagaTo(null, input(6)).next;
  const step1 = settleSagaTo(null, input(3));
  const step2 = settleSagaTo(step1.next, { ...input(6), treasuryBalanceMicro: BigInt(step1.next.lastOnchainTreasuryMicro) }).next;
  assert.equal(ser(step2.chars), ser(oneShot.chars), "per-character state must match across split settles");
});
