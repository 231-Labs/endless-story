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
  expireContracts,
  fillPartnerSlot,
  offerContract,
  persistContracts,
  readyToSettle,
  rejectContract,
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
