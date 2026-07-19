import test from "node:test";
import assert from "node:assert/strict";

import {
  emptyEconomy,
  openAccounts,
  conservesProduction,
  persistEconomy,
  type EconomyState,
} from "../src/production.ts";
import {
  PARTNER_SLOT,
  counterAskGate,
  expireContracts,
  fileCounter,
  fillPartnerSlot,
  offerContract,
  persistContracts,
  readyToSettle,
  rejectContract,
  resolveCounter,
  restoreContracts,
  settleContract,
  signContract,
  type ContractState,
} from "../src/contract.ts";

const YUAN = 100n;

function seed(): ContractState {
  const economy: EconomyState = openAccounts(emptyEconomy(), [
    { id: "liu", ownerType: "character", label: "柳安春", opening: 12n * YUAN },
    { id: "su", ownerType: "character", label: "蘇映雪", opening: 20n * YUAN },
    { id: "troupe", ownerType: "troupe", label: "春雪社班庫", opening: 42n * YUAN, authorizedSpenderIds: ["shen"] },
    { id: "huaguang", ownerType: "business", label: "華光影片社", opening: 500n * YUAN },
  ]);
  return { economy, contracts: {} };
}

// the spring-snow split: 柳安春 80、聯名搭檔 50、春雪社 140 = 270 圓 advance
function springSnowOffer(state: ContractState) {
  return offerContract(state, {
    id: "anchun-exclusive",
    label: "柳安春三日獨家契約",
    proposerAccountId: "huaguang",
    total: 270n * YUAN,
    splits: [
      { beneficiary: "liu", amount: 80n * YUAN, memo: "柳安春獨唱片酬" },
      { beneficiary: PARTNER_SLOT, amount: 50n * YUAN, memo: "聯名搭檔片酬" },
      { beneficiary: "troupe", amount: 140n * YUAN, memo: "春雪社續租與欠薪" },
    ],
    requiredSignerIds: ["liu"],
    partnerRequired: true,
    deadlineDay: 2,
    causeEventId: "e-offer",
  });
}

test("offer escrows the advance and validates split totals", () => {
  const offered = springSnowOffer(seed());
  assert.equal(offered.rejection, undefined);
  assert.equal(offered.state.economy.accounts.huaguang.reserved, 270n * YUAN);
  assert.equal(offered.state.economy.accounts.huaguang.available, 230n * YUAN);
  assert.ok(conservesProduction(offered.state.economy));

  const bad = offerContract(seed(), {
    id: "bad", label: "壞約", proposerAccountId: "huaguang", total: 100n,
    splits: [{ beneficiary: "liu", amount: 60n, memo: "x" }],
    requiredSignerIds: ["liu"], partnerRequired: false, deadlineDay: 2, causeEventId: "e",
  });
  assert.equal(bad.rejection?.code, "SPLIT_MISMATCH");
});

test("an unfilled partner slot blocks settlement — 搭檔未定 cannot settle silently", () => {
  let s = springSnowOffer(seed()).state;
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e-sign" }).state;
  assert.equal(readyToSettle(s.contracts["anchun-exclusive"]), false);

  const blocked = settleContract(s, { contractId: "anchun-exclusive", causeEventId: "e-settle" });
  assert.equal(blocked.rejection?.code, "NOT_COMPLETE");

  // only a required signer can name the partner
  const outsider = fillPartnerSlot(s, { contractId: "anchun-exclusive", actorId: "su", partnerId: "su", causeEventId: "e" });
  assert.equal(outsider.rejection?.code, "NOT_SIGNER");

  s = fillPartnerSlot(s, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "su", causeEventId: "e-fill" }).state;
  const refill = fillPartnerSlot(s, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "troupe", causeEventId: "e" });
  assert.equal(refill.rejection?.code, "PARTNER_TAKEN");

  // partner named but has not countersigned yet
  assert.equal(readyToSettle(s.contracts["anchun-exclusive"]), false);
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "su", causeEventId: "e-sign-2" }).state;
  assert.equal(readyToSettle(s.contracts["anchun-exclusive"]), true);
});

test("signed: settlement pays every named party atomically and idempotently", () => {
  let s = springSnowOffer(seed()).state;
  s = fillPartnerSlot(s, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "su", causeEventId: "e-fill" }).state;
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e1" }).state;
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "su", causeEventId: "e2" }).state;

  const settled = settleContract(s, { contractId: "anchun-exclusive", causeEventId: "e-settle" });
  assert.equal(settled.rejection, undefined);
  const eco = settled.state.economy;
  assert.equal(eco.accounts.liu.available, (12n + 80n) * YUAN);
  assert.equal(eco.accounts.su.available, (20n + 50n) * YUAN);
  assert.equal(eco.accounts.troupe.available, (42n + 140n) * YUAN);
  assert.equal(eco.accounts.huaguang.reserved, 0n);
  assert.equal(eco.accounts.huaguang.available, 230n * YUAN);
  assert.ok(conservesProduction(eco));
  assert.equal(settled.state.contracts["anchun-exclusive"].status, "settled");
  assert.equal(settled.applied.length, 3);
  assert.ok(settled.applied.every((t) => t.causeEventId === "e-settle"));

  const again = settleContract(settled.state, { contractId: "anchun-exclusive", causeEventId: "e-settle" });
  assert.equal(again.duplicate, true);
  assert.equal(again.applied.length, 0);
});

test("rejected: escrow returns to the proposer, beneficiaries get nothing", () => {
  let s = springSnowOffer(seed()).state;
  const rejected = rejectContract(s, { contractId: "anchun-exclusive", actorId: "liu", causeEventId: "e-reject" });
  assert.equal(rejected.rejection, undefined);
  const eco = rejected.state.economy;
  assert.equal(eco.accounts.huaguang.available, 500n * YUAN);
  assert.equal(eco.accounts.huaguang.reserved, 0n);
  assert.equal(eco.accounts.liu.available, 12n * YUAN);
  assert.equal(eco.accounts.troupe.available, 42n * YUAN);
  assert.ok(conservesProduction(eco));
  assert.equal(rejected.state.contracts["anchun-exclusive"].status, "rejected");

  // a dead offer cannot be signed afterwards
  const late = signContract(rejected.state, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e" });
  assert.equal(late.rejection?.code, "NOT_OFFERED");
});

test("deadline: unsigned expires with escrow release; fully signed settles", () => {
  // unsigned → expired
  let s = springSnowOffer(seed()).state;
  const expired = expireContracts(s, { day: 3, causeEventId: "e-deadline" });
  assert.equal(expired.state.contracts["anchun-exclusive"].status, "expired");
  assert.equal(expired.state.economy.accounts.huaguang.available, 500n * YUAN);
  assert.ok(conservesProduction(expired.state.economy));

  // before the deadline nothing happens
  s = springSnowOffer(seed()).state;
  const early = expireContracts(s, { day: 2, causeEventId: "e" });
  assert.equal(early.state.contracts["anchun-exclusive"].status, "offered");

  // fully signed at the deadline → settles instead of expiring
  s = fillPartnerSlot(s, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "su", causeEventId: "e" }).state;
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e" }).state;
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "su", causeEventId: "e" }).state;
  const settledAtDeadline = expireContracts(s, { day: 3, causeEventId: "e-deadline" });
  assert.equal(settledAtDeadline.state.contracts["anchun-exclusive"].status, "settled");
  assert.equal(settledAtDeadline.state.economy.accounts.liu.available, (12n + 80n) * YUAN);
});

test("signed and rejected produce different objective worlds from the same seed", () => {
  const base = springSnowOffer(seed()).state;

  let signedWorld = fillPartnerSlot(base, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "su", causeEventId: "e" }).state;
  signedWorld = signContract(signedWorld, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e" }).state;
  signedWorld = signContract(signedWorld, { contractId: "anchun-exclusive", signerId: "su", causeEventId: "e" }).state;
  signedWorld = settleContract(signedWorld, { contractId: "anchun-exclusive", causeEventId: "e-s" }).state;

  const rejectedWorld = rejectContract(base, { contractId: "anchun-exclusive", actorId: "liu", causeEventId: "e-r" }).state;

  const signedTroupe = signedWorld.economy.accounts.troupe.available;
  const rejectedTroupe = rejectedWorld.economy.accounts.troupe.available;
  assert.equal(signedTroupe - rejectedTroupe, 140n * YUAN);
  assert.notEqual(
    JSON.stringify(persistEconomy(signedWorld.economy)),
    JSON.stringify(persistEconomy(rejectedWorld.economy)),
  );
  assert.ok(conservesProduction(signedWorld.economy));
  assert.ok(conservesProduction(rejectedWorld.economy));
});

test("contract persistence round-trips", () => {
  let s = springSnowOffer(seed()).state;
  s = fillPartnerSlot(s, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "su", causeEventId: "e" }).state;
  s = signContract(s, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e" }).state;
  const restored = restoreContracts(JSON.parse(JSON.stringify(persistContracts(s.contracts))));
  assert.deepEqual(
    persistContracts(restored),
    persistContracts(s.contracts),
  );
});

// ── Stage A: structured MONEY counters (CONTRACT_ESCROW §3) ──

test("fileCounter stores a money ask; a non-positive ask is rejected", () => {
  const s = springSnowOffer(seed()).state;
  const money = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "預付加三十圓", day: 1, ask: 30n * YUAN, causeEventId: "e-counter",
  });
  assert.equal(money.rejection, undefined);
  assert.equal(money.state.contracts["anchun-exclusive"].pendingCounter?.ask, 30n * YUAN);
  assert.equal(money.applied.length, 0); // filing never moves money

  const zero = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "白填", day: 1, ask: 0n, causeEventId: "e",
  });
  assert.equal(zero.rejection?.code, "BAD_ASK");

  const negative = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "倒貼", day: 1, ask: -5n, causeEventId: "e",
  });
  assert.equal(negative.rejection?.code, "BAD_ASK");
});

test("resolveCounter accept+ask+bumpBeneficiary: total up, split up, delta re-escrowed", () => {
  let s = springSnowOffer(seed()).state;
  // huaguang after offer: reserved 270, available 230
  assert.equal(s.economy.accounts.huaguang.reserved, 270n * YUAN);
  assert.equal(s.economy.accounts.huaguang.available, 230n * YUAN);

  s = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "柳安春片酬加三十圓", day: 1, ask: 30n * YUAN, causeEventId: "e-counter",
  }).state;

  const resolved = resolveCounter(s, {
    contractId: "anchun-exclusive", accept: true, day: 2, graceDays: 1,
    bumpBeneficiary: "liu", causeEventId: "e-resolve",
  });
  assert.equal(resolved.rejection, undefined);
  const c = resolved.state.contracts["anchun-exclusive"];
  assert.equal(c.total, 300n * YUAN);                                   // total bumped
  assert.equal(c.splits.find((x) => x.beneficiary === "liu")?.amount, 110n * YUAN); // named split bumped
  assert.equal(c.pendingCounter, undefined);
  assert.deepEqual(c.terms.at(-1), "柳安春片酬加三十圓");
  assert.equal(c.deadlineDay, 3);                                       // 2 + graceDays 1

  const eco = resolved.state.economy;
  assert.equal(eco.accounts.huaguang.reserved, 300n * YUAN);            // reserved grew by exactly ask
  assert.equal(eco.accounts.huaguang.available, 200n * YUAN);           // available shrank by exactly ask
  assert.equal(resolved.applied.length, 1);                            // one real ledger txn (the re-escrow)
  assert.equal(resolved.applied[0].kind, "reserve");
  assert.ok(conservesProduction(eco));

  // and the bumped total settles cleanly: escrow (300) pays out all splits, 0 left over
  let done = fillPartnerSlot(resolved.state, { contractId: "anchun-exclusive", actorId: "liu", partnerId: "su", causeEventId: "e" }).state;
  done = signContract(done, { contractId: "anchun-exclusive", signerId: "liu", causeEventId: "e" }).state;
  done = signContract(done, { contractId: "anchun-exclusive", signerId: "su", causeEventId: "e" }).state;
  const settled = settleContract(done, { contractId: "anchun-exclusive", causeEventId: "e-settle" });
  assert.equal(settled.rejection, undefined);
  assert.equal(settled.state.economy.accounts.liu.available, (12n + 110n) * YUAN); // got the bumped片酬
  assert.equal(settled.state.economy.accounts.huaguang.reserved, 0n);
  assert.equal(settled.state.economy.accounts.huaguang.available, 200n * YUAN);
  assert.ok(conservesProduction(settled.state.economy));
});

test("resolveCounter accept+ask bumping an absent beneficiary pushes a fresh split", () => {
  let s = springSnowOffer(seed()).state;
  s = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "蘇映雪另計三十圓", day: 1, ask: 30n * YUAN, causeEventId: "e-counter",
  }).state;
  const resolved = resolveCounter(s, {
    contractId: "anchun-exclusive", accept: true, day: 2,
    bumpBeneficiary: "su", causeEventId: "e-resolve",
  });
  const c = resolved.state.contracts["anchun-exclusive"];
  const fresh = c.splits.find((x) => x.beneficiary === "su");
  assert.equal(fresh?.amount, 30n * YUAN);
  assert.equal(fresh?.memo, "還價加碼");
  assert.equal(c.total, 300n * YUAN);
  let sum = 0n;
  for (const x of c.splits) sum += x.amount;
  assert.equal(sum, c.total); // splits still sum to total
  assert.ok(conservesProduction(resolved.state.economy));
});

test("resolveCounter accept+ask with NO bumpBeneficiary → ASK_NEEDS_BENEFICIARY", () => {
  let s = springSnowOffer(seed()).state;
  s = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "加三十圓", day: 1, ask: 30n * YUAN, causeEventId: "e-counter",
  }).state;
  const resolved = resolveCounter(s, {
    contractId: "anchun-exclusive", accept: true, day: 2, causeEventId: "e-resolve",
  });
  assert.equal(resolved.rejection?.code, "ASK_NEEDS_BENEFICIARY");
  // nothing moved, the demand is still pending
  assert.equal(resolved.state.contracts["anchun-exclusive"].pendingCounter?.ask, 30n * YUAN);
  assert.equal(resolved.state.economy.accounts.huaguang.reserved, 270n * YUAN);
});

test("resolveCounter accept+ask that the proposer cannot re-escrow surfaces INSUFFICIENT", () => {
  let s = springSnowOffer(seed()).state; // huaguang available 230 after offer
  s = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "加三百圓", day: 1, ask: 300n * YUAN, causeEventId: "e-counter",
  }).state;
  const resolved = resolveCounter(s, {
    contractId: "anchun-exclusive", accept: true, day: 2,
    bumpBeneficiary: "liu", causeEventId: "e-resolve",
  });
  assert.equal(resolved.rejection?.code, "INSUFFICIENT");
  // nothing moved
  assert.equal(resolved.state.economy.accounts.huaguang.reserved, 270n * YUAN);
  assert.equal(resolved.state.economy.accounts.huaguang.available, 230n * YUAN);
  assert.equal(resolved.state.contracts["anchun-exclusive"].total, 270n * YUAN);
});

test("resolveCounter REFUSE of a money counter moves nothing and clears the demand", () => {
  let s = springSnowOffer(seed()).state;
  s = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "加三十圓", day: 1, ask: 30n * YUAN, causeEventId: "e-counter",
  }).state;
  const refused = resolveCounter(s, {
    contractId: "anchun-exclusive", accept: false, day: 2, causeEventId: "e-resolve",
  });
  assert.equal(refused.rejection, undefined);
  assert.equal(refused.applied.length, 0);
  const c = refused.state.contracts["anchun-exclusive"];
  assert.equal(c.pendingCounter, undefined);
  assert.equal(c.total, 270n * YUAN);                        // unchanged
  assert.equal(refused.state.economy.accounts.huaguang.reserved, 270n * YUAN);
});

test("a CONDITION counter (no ask) resolves exactly as before — money untouched", () => {
  let s = springSnowOffer(seed()).state;
  const before = JSON.stringify(persistContracts(s.contracts)); // capture split/total shape
  s = fileCounter(s, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "限期加一日", day: 1, causeEventId: "e-counter",
  }).state;
  assert.equal(s.contracts["anchun-exclusive"].pendingCounter?.ask, undefined);

  const resolved = resolveCounter(s, {
    contractId: "anchun-exclusive", accept: true, day: 1, graceDays: 1, causeEventId: "e-resolve",
  });
  assert.equal(resolved.applied.length, 0);            // no money moved
  const c = resolved.state.contracts["anchun-exclusive"];
  assert.equal(c.total, 270n * YUAN);                  // total untouched
  assert.deepEqual(c.terms.at(-1), "限期加一日");        // demand appended as a term
  assert.equal(c.deadlineDay, 3);                      // 2 + 1
  assert.equal(c.pendingCounter, undefined);
  assert.equal(resolved.state.economy.accounts.huaguang.reserved, 270n * YUAN);
  // splits identical to the pre-counter shape
  const beforeSplits = JSON.parse(before)["anchun-exclusive"].splits;
  assert.deepEqual(persistContracts(resolved.state.contracts)["anchun-exclusive"].splits, beforeSplits);
});

test("counterAskGate: covers-and-clears-floor ok; breaks-floor refuse; cannot-cover refuse; zero-cost trivial", () => {
  // proposer with 200 available, dailyFixedCost 30
  const eco = openAccounts(emptyEconomy(), [
    { id: "biz", ownerType: "business", label: "堂口", opening: 200n, dailyFixedCost: 30n },
    { id: "poor", ownerType: "business", label: "空堂口", opening: 20n, dailyFixedCost: 30n },
    { id: "free", ownerType: "business", label: "無開銷堂口", opening: 50n },
  ]);
  const floorDays = 3; // floor = 30 * 3 = 90

  // ask 100: 200-100=100 ≥ 90 → ok
  assert.deepEqual(counterAskGate(eco, "biz", 100n, floorDays), { ok: true });
  // ask 120: 200-120=80 < 90 → refuse (breaks the floor)
  const breaks = counterAskGate(eco, "biz", 120n, floorDays);
  assert.equal(breaks.ok, false);
  assert.equal(breaks.reason, "補了這筆押款便要破底");
  // ask 300: exceeds available → refuse (cannot cover)
  const cant = counterAskGate(eco, "biz", 300n, floorDays);
  assert.equal(cant.ok, false);
  assert.equal(cant.reason, "帳上現銀不夠補這筆押款");
  // poor account cannot even cover 25 (25 ≤ 20 is false → cannot cover)
  assert.equal(counterAskGate(eco, "poor", 25n, floorDays).ok, false);
  // zero-fixed-cost account: floor is 0, so any affordable ask clears it
  assert.deepEqual(counterAskGate(eco, "free", 50n, floorDays), { ok: true });
  // unknown account → refuse
  assert.equal(counterAskGate(eco, "ghost", 1n, floorDays).ok, false);
});

test("persist→restore round-trip preserves a money ask (and its absence)", () => {
  // with ask
  let withAsk = springSnowOffer(seed()).state;
  withAsk = fileCounter(withAsk, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "加三十圓", day: 1, ask: 30n * YUAN, causeEventId: "e-counter",
  }).state;
  const rtAsk = restoreContracts(JSON.parse(JSON.stringify(persistContracts(withAsk.contracts))));
  assert.equal(rtAsk["anchun-exclusive"].pendingCounter?.ask, 30n * YUAN);
  assert.deepEqual(persistContracts(rtAsk), persistContracts(withAsk.contracts));

  // condition counter (no ask) restores to ask: undefined
  let noAsk = springSnowOffer(seed()).state;
  noAsk = fileCounter(noAsk, {
    contractId: "anchun-exclusive", actorId: "liu",
    demand: "限期加一日", day: 1, causeEventId: "e-counter",
  }).state;
  const rtNoAsk = restoreContracts(JSON.parse(JSON.stringify(persistContracts(noAsk.contracts))));
  assert.equal(rtNoAsk["anchun-exclusive"].pendingCounter?.ask, undefined);
  assert.equal(persistContracts(rtNoAsk)["anchun-exclusive"].pendingCounter?.askSubunits, undefined);
  assert.deepEqual(persistContracts(rtNoAsk), persistContracts(noAsk.contracts));

  // an OLDER persisted row (no askSubunits field at all) restores cleanly
  const legacy = persistContracts(noAsk.contracts);
  delete (legacy["anchun-exclusive"].pendingCounter as { askSubunits?: string }).askSubunits;
  const rtLegacy = restoreContracts(JSON.parse(JSON.stringify(legacy)));
  assert.equal(rtLegacy["anchun-exclusive"].pendingCounter?.ask, undefined);
});
