// aid.ts — the need-grounded character-to-character AID DECISION core (design §5.2 / Part D D8).
//
// THE LOAD-BEARING IDEA: money must NOT be decided by an LLM. If we let a language model freely
// pick "give 500 to whoever", the flow is arbitrary — exactly the "太假" failure. Instead the
// MONEY is decided here, deterministically, from real economic need (vitality + runway) and the
// relationship; the LLM layer (runner) only supplies the DRAMA — whether to engage at all, the
// in-character reason, the tone — and even that is clamped by these guards plus the applyTransfer
// primitive (no overdraft, no self/dead/rival funding). So "金錢流動合理" is a property of the
// MECHANISM, not of the model's honesty.
//
// decideAid:    a would-be patron, given who's actually failing, picks the neediest eligible
//               recipient and a bounded amount (keep your own reserve; cover their need, no more).
// decideAccept: receiving is also a choice — a rival or a proud-but-not-yet-dying character may
//               refuse charity (§5.2 "受濟也是選擇").
//
// Pure: no chain, no LLM, no I/O. Same derive math as settleDay, so the offline driver, the
// (later) on-chain transfer, and the runner's GIVE phase all reason about need identically.

import { dailyCost, vitalityState } from "./derive.ts";
import type { CharState, EconConfig } from "./types.ts";
import type { TransferMemo } from "./transfer.ts";

/** Relationship stance toward another character (aggregated from relationship tone in the runner). */
export type Relation = "ally" | "neutral" | "rival";

/** A possible recipient: their economic state + how the giver sees them. */
export interface AidCandidate {
  state: CharState;
  relation: Relation;
}

/** Tunables. Defaults below; the runner/sim can override per persona (e.g. a stingy character). */
export interface AidParams {
  /** keep this many days of the GIVER's own cost in reserve before giving anything. */
  reserveDays: bigint;
  /** lift a needy recipient to about this many days of runway (and the need threshold). */
  targetRunwayDays: bigint;
}

export const DEFAULT_AID: AidParams = { reserveDays: 10n, targetRunwayDays: 7n };

export type AidReason =
  | "rescue"               // gave: a real need was met
  | "no-need"              // nobody eligible is actually short → no money moves
  | "insufficient-surplus" // giver can't spare anything past its own reserve
  | "self-failing";        // giver is itself dying → keeps its money

export interface AidDecision {
  doAid: boolean;
  recipientId: string | null;
  amount: bigint;          // base units; 0 when not giving
  memo: TransferMemo;
  reason: AidReason;
}

const NO = (reason: AidReason): AidDecision => ({ doAid: false, recipientId: null, amount: 0n, memo: "gift", reason });

/** runway in whole days a character can self-fund right now (balance / dailyCost). */
function runwayDays(c: CharState, cfg: EconConfig): bigint {
  return c.balance / dailyCost(c, cfg); // dailyCost > 0 always (cRun floor)
}

/** Genuinely in need = not healthy, OR can't self-fund the target runway. */
function inNeed(c: CharState, cfg: EconConfig, target: bigint): boolean {
  if (vitalityState(c) !== "healthy") return true;
  return c.balance < dailyCost(c, cfg) * target;
}

/**
 * Decide whether (and how much) `self` aids someone. Deterministic + need-grounded:
 *   • give nothing if you're failing yourself, or have no surplus past your reserve;
 *   • give nothing if nobody eligible is actually short (← the key anti-"太假" guard);
 *   • otherwise rescue the NEEDIEST eligible recipient (lowest vitality, then lowest runway,
 *     allies before neutrals), with amount = min(surplus, what lifts them to target runway).
 * Rivals are never funded. Allies get "patronage", others "gift".
 */
export function decideAid(self: CharState, candidates: AidCandidate[], cfg: EconConfig, params: AidParams = DEFAULT_AID): AidDecision {
  if (self.dead || vitalityState(self) === "failing") return NO("self-failing");

  const reserve = params.reserveDays * dailyCost(self, cfg);
  const surplus = self.balance - reserve;
  if (surplus <= 0n) return NO("insufficient-surplus");

  // eligible = alive, not me, not a rival, and actually short
  const eligible = candidates.filter(
    (cand) => !cand.state.dead && cand.state.cfg.id !== self.cfg.id && cand.relation !== "rival" && inNeed(cand.state, cfg, params.targetRunwayDays),
  );
  if (eligible.length === 0) return NO("no-need");

  // neediest first: lowest vitality, then lowest runway, then ally before neutral, then id (stable)
  const rank = { ally: 0, neutral: 1, rival: 2 } as const;
  eligible.sort((a, b) => {
    if (a.state.vitality !== b.state.vitality) return a.state.vitality < b.state.vitality ? -1 : 1;
    const ra = runwayDays(a.state, cfg);
    const rb = runwayDays(b.state, cfg);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (rank[a.relation] !== rank[b.relation]) return rank[a.relation] - rank[b.relation];
    return a.state.cfg.id < b.state.cfg.id ? -1 : 1;
  });

  const pick = eligible[0];
  const target = dailyCost(pick.state, cfg) * params.targetRunwayDays;
  const need = target > pick.state.balance ? target - pick.state.balance : 0n;
  if (need <= 0n) return NO("no-need"); // not-healthy but already well-funded → vitality will recover on its own
  const amount = need < surplus ? need : surplus;

  return { doAid: true, recipientId: pick.state.cfg.id, amount, memo: pick.relation === "ally" ? "patronage" : "gift", reason: "rescue" };
}

export type AcceptReason = "accept" | "refuse-rival" | "refuse-pride";

export interface AcceptDecision {
  accept: boolean;
  reason: AcceptReason;
}

/**
 * The receiving side's choice (§5.2 "受濟也是選擇"). A rival refuses on principle; a proud
 * character swallows its pride ONLY when truly dying (failing). Everyone else accepts.
 */
export function decideAccept(recipient: CharState, relationToGiver: Relation, prideful: boolean): AcceptDecision {
  if (relationToGiver === "rival") return { accept: false, reason: "refuse-rival" };
  if (prideful && vitalityState(recipient) !== "failing") return { accept: false, reason: "refuse-pride" };
  return { accept: true, reason: "accept" };
}
