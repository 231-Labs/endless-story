// Decoupled verification of the character-to-character money-flow primitive (applyTransfer).
// The load-bearing properties a Move port (`transfer_between_characters`) must also satisfy:
// conservation (a transfer only moves WITHIN Σ balance), no overdraft, alive↔alive guards,
// purity (rejection returns the original state), and deterministic batching.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MUNIT,
  applyTransfer,
  applyTransfers,
  conserves,
  type TransferRequest,
  type WorldEconState,
} from "../src/index.ts";
import { newChar } from "../driver/index.ts";
import { char } from "../scenarios/index.ts";
import { serialize } from "./helpers.ts";

/** Two funded, alive characters in a conserving world (injected === Σ balance). */
function twoCharWorld(aFunds: bigint, bFunds: bigint): WorldEconState {
  const a = newChar(char("a", "花旦", 70, 85, 60, 22, 6), aFunds);
  const b = newChar(char("b", "小生", 65, 70, 75, 20, 3), bFunds);
  return {
    chars: [a, b],
    accounts: { injected: aFunds + bFunds, ownerSink: 0n, storytellerSink: 0n, protocolSink: 0n, sagaTreasury: 0n },
    day: 0n,
  };
}

const gift = (fromId: string, toId: string, amount: bigint): TransferRequest => ({ fromId, toId, amount, memo: "gift" });

test("happy path: balances move exactly, amount + memo reported, world still conserves", () => {
  const w = twoCharWorld(50n * MUNIT, 10n * MUNIT);
  const r = applyTransfer(w, { fromId: "a", toId: "b", amount: 12n * MUNIT, memo: "patronage" });
  assert.equal(r.applied, true);
  assert.equal(r.reason, null);
  assert.equal(r.amount, 12n * MUNIT);
  assert.equal(r.next.chars[0].balance, 38n * MUNIT, "payer debited");
  assert.equal(r.next.chars[1].balance, 22n * MUNIT, "payee credited");
  assert.ok(conserves(r.next), "a horizontal transfer must preserve conservation");
});

test("conservation: Σ balance is invariant across a transfer (net-zero move)", () => {
  const w = twoCharWorld(50n * MUNIT, 10n * MUNIT);
  const before = w.chars[0].balance + w.chars[1].balance;
  const r = applyTransfer(w, gift("a", "b", 7n * MUNIT));
  const after = r.next.chars[0].balance + r.next.chars[1].balance;
  assert.equal(after, before, "Σ balance must not change");
});

test("no overdraft: cannot send more than balance (Move Balance ≥ 0)", () => {
  const w = twoCharWorld(5n * MUNIT, 0n);
  const r = applyTransfer(w, gift("a", "b", 6n * MUNIT));
  assert.equal(r.applied, false);
  assert.equal(r.reason, "insufficient");
  assert.equal(r.amount, 0n);
  assert.equal(r.next.chars[0].balance, 5n * MUNIT, "no debit on rejection");
  assert.equal(r.next.chars[1].balance, 0n, "no credit on rejection");
});

test("guards: self / nonpositive / missing / dead are all rejected", () => {
  const w = twoCharWorld(50n * MUNIT, 10n * MUNIT);
  assert.equal(applyTransfer(w, gift("a", "a", MUNIT)).reason, "self");
  assert.equal(applyTransfer(w, gift("a", "b", 0n)).reason, "nonpositive");
  assert.equal(applyTransfer(w, gift("a", "b", -MUNIT)).reason, "nonpositive");
  assert.equal(applyTransfer(w, gift("ghost", "b", MUNIT)).reason, "from-missing");
  assert.equal(applyTransfer(w, gift("a", "ghost", MUNIT)).reason, "to-missing");

  const dead = twoCharWorld(50n * MUNIT, 10n * MUNIT);
  dead.chars[1].dead = true;
  assert.equal(applyTransfer(dead, gift("a", "b", MUNIT)).reason, "to-dead", "the dead don't receive");
  dead.chars[0].dead = true;
  assert.equal(applyTransfer(dead, gift("a", "b", MUNIT)).reason, "from-dead", "the dead don't give");
});

test("purity: applyTransfer never mutates its input world", () => {
  const w = twoCharWorld(50n * MUNIT, 10n * MUNIT);
  const before = serialize(w);
  applyTransfer(w, gift("a", "b", 9n * MUNIT));        // accepted
  applyTransfer(w, gift("a", "b", 999n * MUNIT));      // rejected
  assert.equal(serialize(w), before, "input world must be untouched");
});

test("batch: applies in order, skips (records) rejects, stays conserving + deterministic", () => {
  const w = twoCharWorld(20n * MUNIT, 0n);
  const reqs: TransferRequest[] = [
    gift("a", "b", 8n * MUNIT),   // ok → a:12 b:8
    gift("a", "b", 99n * MUNIT),  // reject insufficient
    gift("b", "a", 3n * MUNIT),   // ok → a:15 b:5
  ];
  const r = applyTransfers(w, reqs);
  assert.equal(r.applied, 2);
  assert.deepEqual(r.results.map((x) => x.applied), [true, false, true]);
  assert.equal(r.next.chars[0].balance, 15n * MUNIT);
  assert.equal(r.next.chars[1].balance, 5n * MUNIT);
  assert.ok(conserves(r.next));
  // deterministic: same batch on a fresh identical world → byte-identical result
  const again = applyTransfers(twoCharWorld(20n * MUNIT, 0n), reqs);
  assert.equal(serialize(again.next), serialize(r.next));
});
