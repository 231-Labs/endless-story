// Decoupled verification of the AID DECISION core (decideAid / decideAccept) — the answer to
// "do characters actually transfer money when there's a real need, and is the flow reasonable
// (not LLM make-believe)?". Money is decided by deterministic ECONOMIC NEED here, so every
// property below holds regardless of what an LLM would say:
//   • no need anywhere → NO money moves (the anti-"太假" guard)
//   • real need → the NEEDIEST eligible character is rescued, amount BOUNDED by surplus & need
//   • rivals are never funded; a giver that's broke or dying keeps its money
//   • receiving is a choice (rival / proud refusals)
//   • integration: in a LIVING world, need-driven aid causally lowers deaths (re-derives H4
//     through the decision core, not the hardcoded greedy policy), conservation intact.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ECON,
  MUNIT,
  VIT_PT,
  applyTransfer,
  conserves,
  decideAccept,
  decideAid,
  settleDay,
  vitalityState,
  type AidCandidate,
  type CharState,
  type Relation,
  type WorldEconState,
} from "../src/index.ts";
import { newChar } from "../driver/index.ts";
import { char } from "../scenarios/index.ts";

const cfg = DEFAULT_ECON;

/** Build a character with a chosen vitality (whole points) + balance (whole ENDLESS). */
function mk(id: string, vitPts: number, balE: number, opts: { role?: string; subs?: number } = {}): CharState {
  const c = newChar(char(id, opts.role ?? "小生", 60, 60, 60, 20, 100), BigInt(balE) * MUNIT);
  c.vitality = BigInt(vitPts) * VIT_PT;
  c.subscribers = BigInt(opts.subs ?? 0);
  return c;
}
const cand = (state: CharState, relation: Relation): AidCandidate => ({ state, relation });

// ── unit: the decision is need-grounded ──────────────────────────────────────

test("no need → NO money moves (a healthy, well-funded ally is left alone)", () => {
  const self = mk("self", 100, 500);
  const d = decideAid(self, [cand(mk("a", 100, 500), "ally")], cfg);
  assert.equal(d.doAid, false);
  assert.equal(d.reason, "no-need");
  assert.equal(d.amount, 0n);
});

test("real need → patronage to the ally, amount bounded and the transfer is executable", () => {
  const self = mk("self", 100, 500);
  const ally = mk("a", 40, 5); // strained + nearly broke → genuinely in need
  const d = decideAid(self, [cand(ally, "ally")], cfg);
  assert.equal(d.doAid, true);
  assert.equal(d.recipientId, "a");
  assert.equal(d.memo, "patronage");
  assert.ok(d.amount > 0n, "money actually flows toward need");
  // The decided amount passes the primitive's guards (no overdraft) and the giver keeps a reserve.
  const world: WorldEconState = {
    chars: [self, ally],
    accounts: { injected: 505n * MUNIT, ownerSink: 0n, storytellerSink: 0n, protocolSink: 0n, sagaTreasury: 0n },
    day: 0n,
  };
  const after = applyTransfer(world, { fromId: "self", toId: "a", amount: d.amount, memo: d.memo });
  assert.ok(after.applied, "the decided transfer actually executes (passes applyTransfer guards)");
  assert.ok(after.next.chars[0].balance > 0n, "giver never empties itself");
  assert.equal(after.next.chars[1].balance, ally.balance + d.amount, "recipient gets exactly the decided amount");
});

test("neediest first: the lower-vitality ally is rescued before the merely strained one", () => {
  const self = mk("self", 100, 500);
  const strained = mk("a", 50, 5);
  const dying = mk("b", 20, 5);
  const d = decideAid(self, [cand(strained, "ally"), cand(dying, "ally")], cfg);
  assert.equal(d.recipientId, "b", "rescue the one closest to death first");
});

test("rivals are never funded — a dying enemy gets nothing", () => {
  const self = mk("self", 100, 500);
  const enemy = mk("x", 10, 0); // about to die, but a rival
  const d = decideAid(self, [cand(enemy, "rival")], cfg);
  assert.equal(d.doAid, false);
  assert.equal(d.reason, "no-need", "rival is filtered out → no eligible need");
});

test("a broke giver can't help even a dying ally (no overdraft, ever)", () => {
  const self = mk("self", 100, 5); // basically no surplus past its own reserve
  const ally = mk("a", 15, 0);
  const d = decideAid(self, [cand(ally, "ally")], cfg);
  assert.equal(d.doAid, false);
  assert.equal(d.reason, "insufficient-surplus");
});

test("a giver that's itself failing keeps its money", () => {
  const self = mk("self", 20, 500); // failing
  const ally = mk("a", 30, 0);
  const d = decideAid(self, [cand(ally, "ally")], cfg);
  assert.equal(d.doAid, false);
  assert.equal(d.reason, "self-failing");
});

// ── unit: receiving is also a choice ─────────────────────────────────────────

test("decideAccept: rival refuses; proud-but-not-dying refuses; the dying swallow pride", () => {
  const strained = mk("r", 50, 0);
  const dying = mk("r", 20, 0);
  assert.equal(decideAccept(strained, "rival", false).reason, "refuse-rival");
  assert.equal(decideAccept(strained, "ally", true).reason, "refuse-pride", "pride refuses charity while still standing");
  assert.equal(decideAccept(dying, "ally", true).accept, true, "but the dying accept help");
  assert.equal(decideAccept(strained, "ally", false).accept, true, "the humble simply accept");
});

// ── integration: need-driven aid saves lives in a LIVING world ───────────────

function runWorld(aidOn: boolean): { dead: number; conservedEveryDay: boolean } {
  // a rich patron + three poor allies (mirrors the H4 alliance cast).
  const cast = [
    newChar(char("patron", "花旦", 80, 90, 80, 26, 6), 56n * MUNIT),
    newChar(char("窮甲", "文人", 55, 52, 58, 30, 0), 56n * MUNIT),
    newChar(char("窮乙", "樂師", 56, 50, 55, 32, -1), 56n * MUNIT),
    newChar(char("窮丙", "老生", 58, 54, 56, 34, -2), 56n * MUNIT),
  ];
  let world: WorldEconState = {
    chars: cast,
    accounts: { injected: 4n * 56n * MUNIT, ownerSink: 0n, storytellerSink: 0n, protocolSink: 0n, sagaTreasury: 0n },
    day: 0n,
  };
  let conservedEveryDay = conserves(world);

  for (let t = 0; t < 150; t++) {
    for (const c of world.chars) {
      if (!c.dead) c.subscribers = c.cfg.id === "patron" ? 40n : 2n; // patron pulls a crowd; allies scrape by
    }
    world = settleDay(world, cfg).next;
    if (!conserves(world)) conservedEveryDay = false;

    if (aidOn) {
      // GIVE phase: the richest healthy character rescues failing allies (batched), each move
      // routed through the same applyTransfer primitive the on-chain transfer will use.
      for (let guard = 0; guard < 20; guard++) {
        let giver: CharState | null = null;
        for (const c of world.chars) {
          if (!c.dead && vitalityState(c) === "healthy" && (!giver || c.balance > giver.balance)) giver = c;
        }
        if (!giver) break;
        const candidates = world.chars.filter((c) => !c.dead && c.cfg.id !== giver!.cfg.id).map((c) => cand(c, "ally"));
        const d = decideAid(giver, candidates, cfg);
        if (!d.doAid || !d.recipientId) break;
        const r = applyTransfer(world, { fromId: giver.cfg.id, toId: d.recipientId, amount: d.amount, memo: d.memo });
        if (!r.applied) break;
        world = r.next;
        if (!conserves(world)) conservedEveryDay = false;
      }
    }
  }
  return { dead: world.chars.filter((c) => c.dead).length, conservedEveryDay };
}

test("integration: need-driven aid causally lowers deaths, conservation holds throughout", () => {
  const off = runWorld(false);
  const on = runWorld(true);
  assert.ok(off.dead > 0, "baseline: poor allies genuinely die without help");
  assert.ok(on.dead < off.dead, `aid must save lives: on=${on.dead} vs off=${off.dead}`);
  assert.ok(off.conservedEveryDay && on.conservedEveryDay, "no money is created or destroyed by aid");
});
