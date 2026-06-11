// transfer.ts — character-to-character money flow primitive (decision ④ / design §5.2).
//
// This is the OTHER pure economic transition besides settleDay: a HORIZONTAL balance move
// between two living characters (gift / patronage / loan / repay / bribe / tribute). Until
// now this lived ONLY as a greedy policy baked inside the offline driver (runPatronage), so
// the money-flow mechanism was validated (H4) but not decoupled. Lifting it here makes it the
// single source of truth the driver's patronage policy, the (later) on-chain
// `transfer_between_characters`, and the runner's GIVE phase all reuse — never reimplement
// (same discipline as settleDay / the drama-engine "one transition" rule).
//
// Conservation: a transfer only moves money WITHIN Σ balance (one char → another). It never
// touches `injected` or any sink, so `injected === sinks + treasury + Σ balance` is preserved
// by construction. Guards keep it honest: alive↔alive only, no self-transfer, positive amount,
// no overdraft (Move Balance can never go negative).

import type { CharState, WorldEconState } from "./types.ts";

/** Why a transfer happened — feeds relationship tone (gift→affection, loan-overdue→rivalry…). */
export type TransferMemo = "gift" | "patronage" | "loan" | "repay" | "bribe" | "tribute";

/** Why a transfer was rejected (caller gets the original state back, unchanged). */
export type TransferReject =
  | "self"          // from === to
  | "from-missing"  // no character with that id
  | "to-missing"    // no character with that id
  | "from-dead"     // the dead don't give
  | "to-dead"       // the dead don't receive (estate already settled to owner)
  | "nonpositive"   // amount ≤ 0
  | "insufficient"; // payer balance < amount (no overdraft — Move Balance ≥ 0)

export interface TransferRequest {
  fromId: string;
  toId: string;
  amount: bigint;
  memo: TransferMemo;
}

export interface TransferResult {
  next: WorldEconState;
  applied: boolean;
  amount: bigint;             // actually moved (0 when rejected)
  reason: TransferReject | null;
}

function cloneWorld(w: WorldEconState): WorldEconState {
  return {
    chars: w.chars.map((c) => ({ ...c, cfg: c.cfg })),
    accounts: { ...w.accounts },
    day: w.day,
  };
}

function indexOfChar(chars: CharState[], id: string): number {
  for (let i = 0; i < chars.length; i++) if (chars[i].cfg.id === id) return i;
  return -1;
}

/**
 * Move `amount` (base units) from one living character to another. Pure: returns a new world
 * on success and the ORIGINAL (unmutated) world on rejection — never mutates its input.
 */
export function applyTransfer(world: WorldEconState, req: TransferRequest): TransferResult {
  const reject = (reason: TransferReject): TransferResult => ({ next: world, applied: false, amount: 0n, reason });
  if (req.fromId === req.toId) return reject("self");
  if (req.amount <= 0n) return reject("nonpositive");
  const fi = indexOfChar(world.chars, req.fromId);
  if (fi < 0) return reject("from-missing");
  const ti = indexOfChar(world.chars, req.toId);
  if (ti < 0) return reject("to-missing");
  if (world.chars[fi].dead) return reject("from-dead");
  if (world.chars[ti].dead) return reject("to-dead");
  if (world.chars[fi].balance < req.amount) return reject("insufficient");

  const next = cloneWorld(world);
  next.chars[fi].balance -= req.amount;
  next.chars[ti].balance += req.amount;
  return { next, applied: true, amount: req.amount, reason: null };
}

export interface BatchResult {
  next: WorldEconState;
  applied: number;            // count succeeded
  results: TransferResult[];  // per-request outcome, in order
}

/**
 * Apply a batch of transfers in order (the GIVE-phase / batched-PTB shape). Pure & deterministic:
 * each step settles against the running world so an earlier transfer's funds are visible to a
 * later one. A rejected request is skipped (recorded), it does not abort the batch.
 */
export function applyTransfers(world: WorldEconState, reqs: TransferRequest[]): BatchResult {
  let cur = world;
  let applied = 0;
  const results: TransferResult[] = [];
  for (const req of reqs) {
    const r = applyTransfer(cur, req);
    if (r.applied) {
      applied += 1;
      cur = r.next;
    }
    results.push(r);
  }
  return { next: cur, applied, results };
}
