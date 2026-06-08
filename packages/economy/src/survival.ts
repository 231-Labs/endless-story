// Lazy-settle survival snapshot — the bridge the web character page calls.
//
// Given a character's CURRENT inputs (real memory_count from the off-chain counter, subscriber
// count, role/attributes, narrative age) and its last persisted economy state, catch the state
// up to `today` by replaying the per-day settle, and return a display snapshot. No tick-loop
// needed: settlement happens lazily on read. Reuses the SAME derive math as the simulation
// (dailyCost / vitality / level / lifeStage) — only the per-character "shadow salary" differs
// from the cohort settle (a single character is funded by its OWN subscription share, which
// preserves H6: no readers → no pay → relies on owner subsidy or declines).
//
// Constants are the DESIGN set (DEFAULT_ECON), not the real ~$ cost: the in-game ENDLESS
// figures (esp. memory rent) are a narrative/economy design lever, not a Walrus pass-through.

import { bclamp, bmin } from "./fixed.ts";
import {
  BPS,
  MUNIT,
  VIT_FULL,
  VIT_PT,
  type CharConfig,
  type CharState,
  type EconConfig,
  type LifeStage,
  type SurvivalLevel,
  type VitalityState,
} from "./types.ts";
import {
  ageHazard,
  dailyCost,
  DEFAULT_ECON,
  lifeStage,
  ONSET_BASE_MY,
  runwayDays,
  survivalLevel,
  vitalityState,
} from "./derive.ts";

/** Newborn seed grant. */
export const SEED_FUNDS_MICRO = 56n * MUNIT;
/** Cap how far back a cold/never-settled character replays (perf guard). */
const MAX_CATCHUP_DAYS = 3650;

/** Inputs the web has from chain + the memory counter. */
export interface SurvivalInput {
  role: string;
  constitution: number;
  appearance: number;
  acuity: number;
  ageYearsStart: number;
  /** real memory total (off-chain counter) — drives storage rent. */
  memoryCount: number;
  /** gallery image count — drives image storage rent. Optional → 0. */
  imageCount?: number;
  /** current subscriber_count — drives income + the active/dormant gate. */
  subscribers: number;
  heldSlot?: boolean;
  /** current narrative day = days lived since birth; settle catches up to here. */
  today: number;
  /** hidden mortality onset (milli-years); defaults to ONSET_BASE. NEVER expose on chain. */
  onsetMilliYears?: bigint;
}

/** JSON-safe persisted economy state (bigints as decimal strings). */
export interface PersistedEcon {
  balanceMicro: string;
  vitalityMilli: string;
  insolventStreak: number;
  settledDay: number;
}

/** Display snapshot for the UI (money in ENDLESS, vitality 0..100). */
export interface SurvivalSnapshot {
  funds: number;
  dailyCost: number;
  salary: number;
  netFlow: number;
  daysLeft: number; // 999 = effectively infinite (net non-negative)
  level: SurvivalLevel;
  memoryCount: number;
  memoryRent: number; // ENDLESS/day from memory storage rent (C_mem × memory_count)
  imageCount: number;
  imageRent: number; // ENDLESS/day from gallery image storage rent (C_img × image_count)
  vitality: number; // 0..100
  vitalityState: VitalityState;
  lifeStage: LifeStage;
  dead: boolean;
}

const toE = (micro: bigint): number => Number(micro) / Number(MUNIT);

function buildState(input: SurvivalInput, balance: bigint, vitality: bigint, streak: number, livedDays: number): CharState {
  const cfg: CharConfig = {
    id: "",
    role: input.role,
    constitution: input.constitution,
    appearance: input.appearance,
    acuity: input.acuity,
    ageYearsStart: input.ageYearsStart,
    onsetMilliYears: input.onsetMilliYears ?? ONSET_BASE_MY,
  };
  return {
    cfg,
    balance,
    vitality,
    memoryCount: BigInt(Math.max(0, Math.round(input.memoryCount))),
    imageCount: BigInt(Math.max(0, Math.round(input.imageCount ?? 0))),
    livedDays: BigInt(Math.max(0, livedDays)),
    subscribers: BigInt(Math.max(0, Math.round(input.subscribers))),
    heldSlot: !!input.heldSlot,
    insolventStreak: BigInt(streak),
    dead: vitality <= 0n,
    diedOnDay: null,
  };
}

/** Single-character salary: funded by the character's OWN subscription treasury share.
 *  0 subscribers → 0 (must rely on owner subsidy — preserves the H6 dynamic). */
function shadowSalary(state: CharState, cfg: EconConfig): bigint {
  return (cfg.subPriceMoney * state.subscribers * cfg.treasuryBps) / BPS;
}

/** Catch a character's economy state up to `today` and return a display snapshot. Pure. */
export function lazySettle(prior: PersistedEcon | null, input: SurvivalInput, cfg: EconConfig = DEFAULT_ECON): { next: PersistedEcon; snapshot: SurvivalSnapshot } {
  let balance = prior ? BigInt(prior.balanceMicro) : SEED_FUNDS_MICRO;
  let vitality = prior ? BigInt(prior.vitalityMilli) : VIT_FULL;
  let streak = prior ? prior.insolventStreak : 0;
  const target = Math.max(0, Math.floor(input.today));
  let day = prior ? prior.settledDay : 0;
  if (target - day > MAX_CATCHUP_DAYS) day = target - MAX_CATCHUP_DAYS;

  for (; day < target; day++) {
    const c = buildState(input, balance, vitality, streak, day);
    const dc = dailyCost(c, cfg);
    const sal = shadowSalary(c, cfg);
    const avail = balance + sal;
    const pay = bmin(avail, dc);
    balance = avail - pay;
    const insolvent = pay < dc;
    streak = insolvent ? streak + 1 : 0;
    const econDmg = insolvent ? cfg.econBase * BigInt(streak) : 0n;
    const recov = insolvent ? 0n : cfg.vitRecovery;
    vitality = bclamp(vitality + recov - econDmg - ageHazard(c, cfg), 0n, VIT_FULL);
    if (vitality <= 0n) {
      day = target; // dead — stop settling
      break;
    }
  }

  const c = buildState(input, balance, vitality, streak, target);
  const sal = shadowSalary(c, cfg);
  const dc = dailyCost(c, cfg);
  const runway = runwayDays(sal, c, cfg);
  const next: PersistedEcon = {
    balanceMicro: balance.toString(),
    vitalityMilli: vitality.toString(),
    insolventStreak: streak,
    settledDay: target,
  };
  const snapshot: SurvivalSnapshot = {
    funds: toE(balance),
    dailyCost: toE(dc),
    salary: toE(sal),
    netFlow: toE(sal - dc),
    daysLeft: runway === null ? 999 : Number(runway < 999n ? runway : 999n),
    level: vitality <= 0n ? "critical" : survivalLevel(sal, c, cfg),
    memoryCount: input.memoryCount,
    memoryRent: toE(cfg.cMem * BigInt(Math.max(0, Math.round(input.memoryCount)))),
    imageCount: input.imageCount ?? 0,
    imageRent: toE(cfg.cImg * BigInt(Math.max(0, Math.round(input.imageCount ?? 0)))),
    vitality: Number(vitality) / Number(VIT_PT),
    vitalityState: vitalityState(c),
    lifeStage: lifeStage(sal, c, cfg),
    dead: vitality <= 0n,
  };
  return { next, snapshot };
}
