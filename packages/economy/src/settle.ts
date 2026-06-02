// settleDay — the ONE economic transition. Pure: (state, cfg) → next state + ledger.
// One call = one narrative day. Never mutates its input. Deterministic bigint math, so a
// Move port (economy.move) reproduces it byte-for-byte and the simulator validates it
// offline at thousands of days/second.
//
// Per-day order (A1 money flow):
//   1. subscription inflow → RevenueConfig split (owner / storyteller / saga payroll pool)
//   2. payroll: pay each alive character from the pool (base floor + perf bonus; prorate if short)
//   3. dailyCost: each character pays the protocol (funds real infra); insolvency tracked
//   4. vitality: economic-death track (insolvency streak) + age-death track (hidden hazard)
//   5. death: vitality ≤ 0 → estate to owner, slot released, marked dead
//   6. accrual: memory (append-only) + livedDays advance
//
// Conservation (asserted in tests) holds across every step:
//   injected === ownerSink + storytellerSink + protocolSink + sagaTreasury + Σ balance

import { bclamp, bmax, bmin } from "./fixed.ts";
import { ageHazard, baseFloorAdj, dailyCost } from "./derive.ts";
import {
  BPS,
  VIT_FULL,
  type Accounts,
  type CharState,
  type EconConfig,
  type WorldEconState,
} from "./types.ts";

export interface PerCharLedger {
  salary: bigint;
  dailyCost: bigint;
  insolvent: boolean;
  diedToday: boolean;
}

export interface DayFlows {
  gross: bigint; // subscription money injected this day
  ownerCut: bigint;
  storytellerCut: bigint;
  paid: bigint; // total salary paid into balances
  costCollected: bigint; // total dailyCost → protocol
  estates: bigint; // dead balances → owner
}

export interface DaySettle {
  next: WorldEconState;
  perChar: Record<string, PerCharLedger>;
  flows: DayFlows;
}

function cloneChar(c: CharState): CharState {
  return { ...c, cfg: c.cfg };
}

/** Advance the world one narrative day. Pure. */
export function settleDay(state: WorldEconState, cfg: EconConfig): DaySettle {
  const chars = state.chars.map(cloneChar);
  const acc: Accounts = { ...state.accounts };
  const perChar: Record<string, PerCharLedger> = {};

  const aliveIdx: number[] = [];
  for (let i = 0; i < chars.length; i++) if (!chars[i].dead) aliveIdx.push(i);

  // ── 1. subscription inflow + RevenueConfig split ──
  let totalSub = 0n;
  for (const i of aliveIdx) totalSub += chars[i].subscribers;
  const gross = cfg.subPriceMoney * totalSub;
  acc.injected += gross;
  const ownerCut = (gross * cfg.ownerBps) / BPS;
  const storytellerCut = (gross * cfg.storytellerBps) / BPS;
  const treasuryCut = gross - ownerCut - storytellerCut; // remainder-safe → payroll pool
  acc.ownerSink += ownerCut;
  acc.storytellerSink += storytellerCut;

  // ── 2. payroll from this day's pool + any carryover ──
  const budget = treasuryCut + acc.sagaTreasury;
  const baseAdj: bigint[] = chars.map((c) => 0n);
  let sumBase = 0n;
  for (const i of aliveIdx) {
    baseAdj[i] = baseFloorAdj(chars[i], cfg);
    sumBase += baseAdj[i];
  }
  const salary: bigint[] = chars.map(() => 0n);
  let paid = 0n;
  if (budget <= 0n || sumBase === 0n) {
    // nothing to pay
  } else if (budget < sumBase) {
    // shortfall → prorate base floors, no performance bonus (saga can't cover full payroll)
    for (const i of aliveIdx) {
      const s = (baseAdj[i] * budget) / sumBase;
      salary[i] = s;
      paid += s;
    }
  } else {
    // base floors covered → distribute the surplus as performance bonus by subscriber pull
    const perfPool = budget - sumBase;
    for (const i of aliveIdx) {
      let s = baseAdj[i];
      if (totalSub > 0n) s += (perfPool * chars[i].subscribers) / totalSub;
      salary[i] = s;
      paid += s;
    }
  }
  acc.sagaTreasury = budget - paid; // undistributed remainder carries forward
  for (const i of aliveIdx) chars[i].balance += salary[i];

  // ── 3–6. per-character cost, vitality, death, accrual ──
  let costCollected = 0n;
  let estates = 0n;
  for (const i of aliveIdx) {
    const c = chars[i];

    // 3. dailyCost → protocol (pay what you can; shortfall = insolvent)
    const dc = dailyCost(c, cfg);
    const pay = bmin(c.balance, dc);
    c.balance -= pay;
    acc.protocolSink += pay;
    costCollected += pay;
    const insolvent = pay < dc;

    // 4. vitality: economic track + age track
    if (insolvent) c.insolventStreak += 1n;
    else c.insolventStreak = 0n;
    const econDamage = insolvent ? cfg.econBase * c.insolventStreak : 0n;
    const recovery = insolvent ? 0n : cfg.vitRecovery;
    const ageHaz = ageHazard(c, cfg);
    c.vitality = bclamp(c.vitality + recovery - econDamage - ageHaz, 0n, VIT_FULL);

    // 6. accrual (append-only memory + age) — happens whether or not death follows
    c.memoryCount += c.subscribers > 0n ? cfg.memPerDayActive : cfg.memPerDayDormant;
    c.livedDays += 1n;

    // 5. death — vitality bottomed out
    let diedToday = false;
    if (c.vitality <= 0n) {
      c.dead = true;
      c.diedOnDay = state.day;
      acc.ownerSink += c.balance; // estate → owner (conserved)
      estates += c.balance;
      c.balance = 0n;
      c.heldSlot = false; // release contested slot back to the free pool (driver re-contests)
      diedToday = true;
    }

    perChar[c.cfg.id] = { salary: salary[i], dailyCost: dc, insolvent, diedToday };
  }

  return {
    next: { chars, accounts: acc, day: state.day + 1n },
    perChar,
    flows: { gross, ownerCut, storytellerCut, paid, costCollected, estates },
  };
}

/** Total ENDLESS the conservation invariant must balance to. */
export function totalAccounted(state: WorldEconState): bigint {
  const { ownerSink, storytellerSink, protocolSink, sagaTreasury } = state.accounts;
  let bal = 0n;
  for (const c of state.chars) bal += c.balance;
  return ownerSink + storytellerSink + protocolSink + sagaTreasury + bal;
}

/** Conservation check: injected === everything else. */
export function conserves(state: WorldEconState): boolean {
  return state.accounts.injected === totalAccounted(state);
}
