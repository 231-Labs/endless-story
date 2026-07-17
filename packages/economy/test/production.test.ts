import test from "node:test";
import assert from "node:assert/strict";

import {
  accountRunwayDays,
  conservesProduction,
  depositExternal,
  emptyEconomy,
  maySpend,
  openAccounts,
  persistEconomy,
  purchase,
  releaseFunds,
  reserveFunds,
  restoreEconomy,
  settleEconomyDay,
  transferMoney,
  type EconomyState,
} from "../src/production.ts";

const YUAN = 100n; // season minimum unit = 分

function seedWorld(): EconomyState {
  return openAccounts(emptyEconomy(), [
    { id: "liu", ownerType: "character", label: "柳安春", opening: 12n * YUAN, dailyFixedCost: 3n * YUAN },
    { id: "su", ownerType: "character", label: "蘇映雪", opening: 20n * YUAN, dailyFixedCost: 3n * YUAN },
    { id: "shen", ownerType: "character", label: "沈雪笙", opening: 8n * YUAN, dailyFixedCost: 3n * YUAN },
    {
      id: "troupe", ownerType: "troupe", label: "春雪社班庫", opening: 42n * YUAN,
      dailyFixedCost: 18n * YUAN, authorizedSpenderIds: ["shen"],
    },
    { id: "market", ownerType: "business", label: "上海市面", opening: 0n },
    { id: "huaguang", ownerType: "business", label: "華光影片社", opening: 500n * YUAN },
  ]);
}

function serialize(state: EconomyState): string {
  return JSON.stringify(persistEconomy(state));
}

test("conservation holds across every transition kind", () => {
  let s = seedWorld();
  assert.ok(conservesProduction(s));

  const deposit = depositExternal(s, {
    txnId: "t1", to: "troupe", amount: 10n * YUAN, memo: "義演捐款", causeEventId: "e1",
  });
  assert.equal(deposit.rejection, undefined);
  s = deposit.state;
  assert.ok(conservesProduction(s));

  const gift = transferMoney(s, {
    txnId: "t2", actorId: "su", from: "su", to: "liu", amount: 2n * YUAN, memo: "點心錢", causeEventId: "e2",
  });
  assert.equal(gift.rejection, undefined);
  s = gift.state;
  assert.ok(conservesProduction(s));

  const meal = purchase(s, {
    txnId: "t3", actorId: "liu", from: "liu", to: "market", amount: 3n * YUAN, memo: "一餐", causeEventId: "e3",
  });
  assert.equal(meal.rejection, undefined);
  s = meal.state;
  assert.ok(conservesProduction(s));

  const escrow = reserveFunds(s, { txnId: "t4", accountId: "huaguang", amount: 270n * YUAN, memo: "預付款入押", causeEventId: "e4" });
  assert.equal(escrow.rejection, undefined);
  s = escrow.state;
  assert.ok(conservesProduction(s));
  assert.equal(s.accounts.huaguang.reserved, 270n * YUAN);

  const release = releaseFunds(s, { txnId: "t5", accountId: "huaguang", amount: 270n * YUAN, memo: "退回", causeEventId: "e5" });
  assert.equal(release.rejection, undefined);
  s = release.state;
  assert.ok(conservesProduction(s));
  assert.equal(s.accounts.huaguang.reserved, 0n);
});

test("no overdraft: rejection leaves state untouched", () => {
  const s = seedWorld();
  const before = serialize(s);
  const r = transferMoney(s, {
    txnId: "t1", actorId: "liu", from: "liu", to: "su", amount: 100n * YUAN, memo: "too much", causeEventId: "e1",
  });
  assert.equal(r.rejection?.code, "INSUFFICIENT");
  assert.equal(serialize(r.state), before);
  assert.equal(serialize(s), before);
});

test("spending authority: personal money is personal, treasury needs authorization", () => {
  const s = seedWorld();

  // knowing the treasury exists ≠ having authority to spend it
  const theft = transferMoney(s, {
    txnId: "t1", actorId: "liu", from: "troupe", to: "liu", amount: 1n * YUAN, memo: "挪用", causeEventId: "e1",
  });
  assert.equal(theft.rejection?.code, "NOT_AUTHORIZED");

  const approved = transferMoney(s, {
    txnId: "t2", actorId: "shen", from: "troupe", to: "liu", amount: 1n * YUAN, memo: "班主核准", causeEventId: "e2",
  });
  assert.equal(approved.rejection, undefined);

  const pickpocket = transferMoney(s, {
    txnId: "t3", actorId: "su", from: "liu", to: "su", amount: 1n * YUAN, memo: "扒竊", causeEventId: "e3",
  });
  assert.equal(pickpocket.rejection?.code, "NOT_AUTHORIZED");

  assert.ok(maySpend(s.accounts.troupe, "shen"));
  assert.ok(!maySpend(s.accounts.troupe, "liu"));
  assert.ok(maySpend(s.accounts.liu, "liu"));
});

test("idempotency: a re-applied transaction id is a silent no-op", () => {
  let s = seedWorld();
  const first = transferMoney(s, {
    txnId: "pay-1", actorId: "su", from: "su", to: "liu", amount: 2n * YUAN, memo: "x", causeEventId: "e1",
  });
  s = first.state;
  const after = serialize(s);
  const again = transferMoney(s, {
    txnId: "pay-1", actorId: "su", from: "su", to: "liu", amount: 2n * YUAN, memo: "x", causeEventId: "e1",
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.applied.length, 0);
  assert.equal(serialize(again.state), after);
});

test("every transaction requires a cause event", () => {
  const s = seedWorld();
  const r = transferMoney(s, {
    txnId: "t1", actorId: "su", from: "su", to: "liu", amount: 1n, memo: "x", causeEventId: "",
  });
  assert.equal(r.rejection?.code, "NO_CAUSE");
});

test("day settlement: wages prorate on shortfall, fixed costs report shortfalls, idempotent per day", () => {
  let s = openAccounts(emptyEconomy(), [
    { id: "a", ownerType: "character", label: "甲", opening: 0n, dailyFixedCost: 3n * YUAN },
    { id: "b", ownerType: "character", label: "乙", opening: 1n * YUAN, dailyFixedCost: 3n * YUAN },
    { id: "troupe", ownerType: "troupe", label: "班庫", opening: 6n * YUAN, dailyFixedCost: 4n * YUAN, authorizedSpenderIds: [] },
    { id: "market", ownerType: "business", label: "市面", opening: 0n },
  ]);

  // schedule 4 + 4 = 8 圓 against a 6 圓 pot → prorated to 3 + 3 (same rule as settleDay)
  const settle = settleEconomyDay(s, {
    day: 0, causeEventId: "day0",
    wages: { payerAccountId: "troupe", orders: [
      { memberAccountId: "a", amount: 4n * YUAN },
      { memberAccountId: "b", amount: 4n * YUAN },
    ] },
    marketAccountId: "market",
  });
  assert.equal(settle.settled, true);
  s = settle.state;
  assert.ok(conservesProduction(s));

  assert.equal(settle.perAccount.a.wage, 3n * YUAN);
  assert.equal(settle.perAccount.b.wage, 3n * YUAN);

  // a: 0 + 3 wage − 3 cost → paid in full; b: 1 + 3 − 3 → fine
  assert.equal(settle.perAccount.a.shortfall, 0n);
  assert.equal(settle.perAccount.b.shortfall, 0n);
  // troupe paid all wages (pot drained to 0) then could not cover its own 4 圓 fixed cost
  assert.equal(settle.perAccount.troupe.fixedCostDue, 4n * YUAN);
  assert.equal(settle.perAccount.troupe.fixedCostPaid, 0n);
  assert.equal(settle.perAccount.troupe.shortfall, 4n * YUAN);

  const after = serialize(s);
  const rerun = settleEconomyDay(s, { day: 0, causeEventId: "day0", marketAccountId: "market" });
  assert.equal(rerun.settled, false);
  assert.equal(serialize(rerun.state), after);
});

test("fixed-cost shortfall: pays what it can and reports the gap", () => {
  const s = openAccounts(emptyEconomy(), [
    { id: "poor", ownerType: "character", label: "窮", opening: 1n * YUAN, dailyFixedCost: 3n * YUAN },
    { id: "market", ownerType: "business", label: "市面", opening: 0n },
  ]);
  const settle = settleEconomyDay(s, { day: 0, causeEventId: "d0", marketAccountId: "market" });
  assert.equal(settle.perAccount.poor.fixedCostPaid, 1n * YUAN);
  assert.equal(settle.perAccount.poor.shortfall, 2n * YUAN);
  assert.equal(settle.state.accounts.poor.available, 0n);
  assert.ok(conservesProduction(settle.state));
});

test("purity: transitions never mutate their input", () => {
  const s = seedWorld();
  const before = serialize(s);
  transferMoney(s, { txnId: "t1", actorId: "su", from: "su", to: "liu", amount: 1n, memo: "x", causeEventId: "e" });
  depositExternal(s, { txnId: "t2", to: "troupe", amount: 5n, memo: "x", causeEventId: "e" });
  reserveFunds(s, { txnId: "t3", accountId: "huaguang", amount: 5n, memo: "x", causeEventId: "e" });
  settleEconomyDay(s, { day: 0, causeEventId: "d", marketAccountId: "market" });
  assert.equal(serialize(s), before);
});

test("runway mirrors the balance/net-burn division", () => {
  const s = seedWorld();
  // 柳安春: 12 圓 at 3 圓/day → 4 days
  assert.equal(accountRunwayDays(s.accounts.liu), 4n);
  // 班庫: 42 圓 at 18 圓/day → 2 days
  assert.equal(accountRunwayDays(s.accounts.troupe), 2n);
  // income ≥ burn → indefinite
  assert.equal(accountRunwayDays(s.accounts.liu, 3n * YUAN), null);
});

test("persist/restore round-trips exactly", () => {
  let s = seedWorld();
  s = transferMoney(s, { txnId: "t1", actorId: "su", from: "su", to: "liu", amount: 7n, memo: "x", causeEventId: "e" }).state;
  s = settleEconomyDay(s, { day: 0, causeEventId: "d", marketAccountId: "market" }).state;
  const restored = restoreEconomy(JSON.parse(JSON.stringify(persistEconomy(s))));
  assert.equal(serialize(restored), serialize(s));
  assert.ok(conservesProduction(restored));
});
