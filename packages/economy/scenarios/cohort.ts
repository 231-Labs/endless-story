// Scenario builders. makeWorld returns a FRESH world each run (no shared mutable state).
// Money invariant at day 0: injected === Σ initial balances (sinks/treasury start at 0).

import { dailyCost, DEFAULT_ECON, makeOnset, MUNIT, type CharConfig, type CharState, type EconConfig, type WorldEconState } from "../src/index.ts";
import { newChar } from "../driver/run.ts";
import type { Scenario } from "../driver/types.ts";

export const SEED_FUNDS = 56n * MUNIT; // 安家費 ≈ one week of median cost

/** Build a CharConfig. `onsetVar` shifts the hidden mortality onset (whole years, ±). */
export function char(
  id: string,
  role: string,
  constitution: number,
  appearance: number,
  acuity: number,
  ageYearsStart: number,
  onsetVar: number,
): CharConfig {
  return { id, role, constitution, appearance, acuity, ageYearsStart, onsetMilliYears: makeOnset(onsetVar) };
}

/** World factory from a list of configs; each starts with the seed grant. */
export function world(configs: CharConfig[], seed = SEED_FUNDS): () => WorldEconState {
  return () => ({
    chars: configs.map((c) => newChar(c, seed)),
    accounts: {
      injected: seed * BigInt(configs.length),
      ownerSink: 0n,
      storytellerSink: 0n,
      protocolSink: 0n,
      sagaTreasury: 0n,
    },
    day: 0n,
  });
}

// ── subscriber policies ──────────────────────────────────────────────────────

/** Flat, stable subscriber base (a well-supported troupe). */
export const constSub = (n: bigint) => () => n;

/** Owner-subsidy policy: top a character up to `targetRunwayDays` of cost each day (挹注). */
export function keepSolvent(targetRunwayDays: bigint) {
  return (c: CharState, cfg: EconConfig): bigint => {
    const target = dailyCost(c, cfg) * targetRunwayDays;
    return c.balance < target ? target - c.balance : 0n;
  };
}

/** Slot-holder + good looks attract readers; everyone churns slowly toward a target. */
export function slotDrivenSub(c: { heldSlot: boolean; subscribers: bigint; cfg: CharConfig }, _day: bigint, rand: () => number): bigint {
  const target = (c.heldSlot ? 9 : 2) + Math.floor((c.cfg.appearance + c.cfg.acuity) / 60);
  let s = Number(c.subscribers);
  if (s < target) s += 1;
  else if (s > target) s -= 1;
  if (rand() < 0.08 && s > 0) s -= 1; // churn
  return BigInt(Math.max(0, s));
}

// ── representative casts ─────────────────────────────────────────────────────
const TROUPE: CharConfig[] = [
  char("梅", "花旦", 70, 88, 62, 22, 6),
  char("柳", "小生", 66, 72, 78, 20, 3),
  char("孟", "武生", 82, 60, 55, 25, -2),
];

/** newborn factory — deterministic attrs/role from the birth index. */
function born(n: bigint): CharConfig {
  const i = Number(n);
  const roles = ["花旦", "小生", "武生", "老生", "文人", "樂師"];
  return char(`新${i}`, roles[i % roles.length], 50 + ((i * 7) % 40), 50 + ((i * 13) % 45), 45 + ((i * 5) % 50), 18 + (i % 6), (i % 9) - 4);
}

const ELDERS_AND_YOUTH: CharConfig[] = [
  char("元老", "老生", 70, 55, 60, 54, -3), // near mortality onset → age-death track
  char("名角", "花旦", 78, 90, 70, 30, 5),
  char("後生", "小生", 60, 68, 72, 19, 2),
  char("窮筆", "文人", 55, 50, 65, 28, 0),
];

// ── scenarios ────────────────────────────────────────────────────────────────

/** H1: a well-run troupe self-sustains — long healthy/profitable span, balance accrues. */
export const thriving: Scenario = {
  id: "thriving",
  description: "高訂閱戲班：income≫cost，黃金期自養有餘、累積身家。驗 H1 可養活穩態。",
  makeWorld: world(TROUPE),
  cfg: DEFAULT_ECON,
  policy: { subscriberStep: constSub(16n) },
  horizon: 120,
  seedFunds: SEED_FUNDS,
  seed: 1,
};

/** H2: no subscribers → memory rent inexorably wins → everyone dies (no free immortality). */
export const starving: Scenario = {
  id: "starving",
  description: "零訂閱：記憶租金單調碾壓，全員必經濟死。驗 H2 無永生。",
  makeWorld: world(TROUPE),
  cfg: DEFAULT_ECON,
  policy: {}, // no subscriberStep → subscribers stay 0
  horizon: 90,
  seedFunds: SEED_FUNDS,
  seed: 2,
};

/** H3 + H5: births + a contested slot + churn → generational turnover, healthy distribution. */
export const mixedCohort: Scenario = {
  id: "mixed-cohort",
  description: "老少同台 + 競爭檔期 + 生育：世代交替；非全滅亦非永生、財富分佈健康。驗 H3、H5。",
  makeWorld: world(ELDERS_AND_YOUTH),
  cfg: DEFAULT_ECON,
  policy: {
    subscriberStep: slotDrivenSub,
    slotCapacity1: true,
    // births continue through the horizon (cadence × horizon > max) so the population band is
    // sustained by replacement, not a one-off cohort that slowly dies out.
    births: { everyDays: 12n, max: 30n, make: (_d, n) => born(n) },
  },
  horizon: 320,
  seedFunds: SEED_FUNDS,
  seed: 3,
};

/** Payroll-stress: many mouths, thin subscriptions → base prorated (全班一起縮). */
export const payrollStress: Scenario = {
  id: "payroll-stress",
  description: "人多訂閱薄：sagaInflow<Σ保底 → 保底按比例打折，全班一起縮、慢性死。",
  makeWorld: world([
    char("甲", "小生", 60, 60, 60, 24, 0),
    char("乙", "花旦", 60, 65, 60, 23, 0),
    char("丙", "武生", 65, 55, 58, 26, 0),
    char("丁", "老生", 62, 50, 55, 40, -1),
    char("戊", "文人", 55, 52, 60, 30, 0),
    char("己", "樂師", 58, 48, 50, 33, 0),
  ]),
  cfg: DEFAULT_ECON,
  policy: { subscriberStep: constSub(1n) },
  horizon: 90,
  seedFunds: SEED_FUNDS,
  seed: 4,
};

/** H6: a reader-less but owner-loved character (市井攤販) — kept alive by 挹注 at bounded cost.
 *  Same reader-less start as `starving`, but owner subsidy → survives; dormant gate keeps the
 *  owner's daily burn cheap (and rising only slowly with accumulated memory). */
export const vendor: Scenario = {
  id: "vendor",
  description: "市井攤販：零讀者、owner 挹注豢養。驗 H6 養得起愛角且燒錢有界（休眠 gate → 便宜）。",
  makeWorld: world([char("攤販", "小販", 48, 42, 50, 35, 1), char("老卒", "雜役", 52, 40, 45, 40, -1)]),
  cfg: DEFAULT_ECON,
  policy: { ownerSubsidy: keepSolvent(3n) }, // no subscriberStep → subscribers stay 0
  horizon: 180,
  seedFunds: SEED_FUNDS,
  seed: 5,
};

export const COHORT_SCENARIOS: Scenario[] = [thriving, starving, vendor, mixedCohort, payrollStress];
