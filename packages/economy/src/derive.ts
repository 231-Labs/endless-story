// Pure derived quantities: dailyCost, salary inputs, vitality hazards, runway, level,
// lifeStage. Deterministic bigint arithmetic only (no float, no Math.random). These are the
// equations a Move port (economy.move) and the web adapter both reuse unchanged.

import { bclamp, bmax, mulDiv } from "./fixed.ts";
import {
  BPS,
  DAYS_PER_YEAR,
  MILLI_YEAR,
  MUNIT,
  VIT_PT,
  type CharState,
  type EconConfig,
  type LifeStage,
  type SurvivalLevel,
  type VitalityState,
} from "./types.ts";

// ─── default calibration (owner's A10 constants) ─────────────────────────────
export const DEFAULT_ECON: EconConfig = {
  cRun: 6n * MUNIT,
  cMem: 20_000n, // 0.02 ENDLESS per memory
  cImg: 100_000n, // 0.1 ENDLESS per gallery image (heavier asset, far fewer than memories)
  cSeal: 250_000n, // 0.25 ENDLESS per recall
  activeLiveMilli: 1_000n,
  activeDormantMilli: 300n,
  recallActive: 4n,
  recallDormant: 1n,
  memPerDayActive: 6n,
  memPerDayDormant: 2n,
  subPriceMoney: 3n * MUNIT,
  ownerBps: 2_000n,
  storytellerBps: 3_000n,
  treasuryBps: 5_000n,
  slotBonusMilli: 1_500n,
  vitRecovery: 5n * VIT_PT,
  econBase: 8n * VIT_PT,
  ageK: 3n,
  healthyBalance: 30n * MUNIT,
};

/** Hidden mortality onset baseline, milli-years (≈55y). Per-char variance added by driver. */
export const ONSET_BASE_MY = 55_000n;

/** Build a hidden onset from a deterministic per-character variance (whole years). */
export function makeOnset(varianceYears: number): bigint {
  return ONSET_BASE_MY + BigInt(varianceYears) * MILLI_YEAR;
}

// ─── role base-floor salary table (A3.1), ENDLESS/day ────────────────────────
// Ordered: more specific role keywords before broader ones (substring match). base is whole ENDLESS.
const ROLE_BASE_FLOOR_GROUPS: { match: string[]; base: bigint }[] = [
  { match: ["富商", "商", "老闆", "東家", "金主"], base: 12n },
  { match: ["武小生", "武生", "武旦", "刀馬"], base: 9n },
  { match: ["花旦", "青衣", "名伶", "坤伶", "旦"], base: 10n },
  { match: ["小生", "文小生"], base: 8n },
  { match: ["老生", "鬚生", "老旦"], base: 7n },
  { match: ["小報", "記者", "筆", "文人", "報館"], base: 6n },
  { match: ["琴師", "樂師", "鼓", "場面", "文武場"], base: 5n },
];
const FALLBACK_BASE = 7n;

/** Per-role base floor in ENDLESS base units. First substring match wins (ordered). */
export function roleBaseFloor(role: string): bigint {
  for (const g of ROLE_BASE_FLOOR_GROUPS) {
    for (const kw of g.match) {
      if (role.includes(kw)) return g.base * MUNIT;
    }
  }
  return FALLBACK_BASE * MUNIT;
}

/** attrModifier ×1000: clamp(1 + (con+app+acu − 150)/300, 0.7, 1.3). disposition excluded. */
export function attrModifierMilli(c: CharState): bigint {
  const sum = BigInt(c.cfg.constitution + c.cfg.appearance + c.cfg.acuity);
  const raw = 1_000n + ((sum - 150n) * 1_000n) / 300n;
  return bclamp(raw, 700n, 1_300n);
}

/** Base-floor salary adjusted by attributes and (if held) the contested-slot bonus. */
export function baseFloorAdj(c: CharState, cfg: EconConfig): bigint {
  let v = mulDiv(roleBaseFloor(c.cfg.role), attrModifierMilli(c), 1_000n);
  if (c.heldSlot) v = mulDiv(v, cfg.slotBonusMilli, 1_000n);
  return v;
}

/** activeFactor ×1000 (subscriber gate: dormant when no subscribers). */
export function activeMilli(c: CharState, cfg: EconConfig): bigint {
  return c.subscribers > 0n ? cfg.activeLiveMilli : cfg.activeDormantMilli;
}

/** recalls this day (drops to dormant level when POV is gated off). */
export function recallCount(c: CharState, cfg: EconConfig): bigint {
  return c.subscribers > 0n ? cfg.recallActive : cfg.recallDormant;
}

/** dailyCost = C_run·active + C_mem·memory_count + C_seal·recalls (A2). */
export function dailyCost(c: CharState, cfg: EconConfig): bigint {
  const run = mulDiv(cfg.cRun, activeMilli(c, cfg), 1_000n);
  const mem = cfg.cMem * c.memoryCount;
  const img = cfg.cImg * c.imageCount;
  const seal = cfg.cSeal * recallCount(c, cfg);
  return run + mem + img + seal;
}

/** Current age in milli-years = startYears + livedDays/yearLen. */
export function ageNowMilliYears(c: CharState): bigint {
  return BigInt(c.cfg.ageYearsStart) * MILLI_YEAR + mulDiv(c.livedDays, MILLI_YEAR, DAYS_PER_YEAR);
}

/** Age hazard (milli-points/day): ageK × max(0, age − hidden onset). 0 before onset. */
export function ageHazard(c: CharState, cfg: EconConfig): bigint {
  const over = bmax(0n, ageNowMilliYears(c) - c.cfg.onsetMilliYears);
  return cfg.ageK * over;
}

/** netFlow = salary − dailyCost for the given day's salary. */
export function netFlow(salary: bigint, c: CharState, cfg: EconConfig): bigint {
  return salary - dailyCost(c, cfg);
}

/** runway in days, or null for ∞ (net non-negative). */
export function runwayDays(salary: bigint, c: CharState, cfg: EconConfig): bigint | null {
  const nf = netFlow(salary, c, cfg);
  if (nf >= 0n) return null;
  return c.balance / -nf;
}

/** SurvivalLevel from net flow + runway + balance (A4). */
export function survivalLevel(salary: bigint, c: CharState, cfg: EconConfig): SurvivalLevel {
  const nf = netFlow(salary, c, cfg);
  const runway = runwayDays(salary, c, cfg); // null = ∞
  if (nf > 0n && c.balance >= cfg.healthyBalance) return "healthy";
  if (nf >= 0n || (runway !== null && runway >= 14n)) return "stable";
  if (runway !== null && runway >= 7n) return "low";
  return "critical";
}

/** Vitality bucket for UI / state machine (A7). */
export function vitalityState(c: CharState): VitalityState {
  if (c.dead || c.vitality <= 0n) return "dead";
  if (c.vitality > 66n * VIT_PT) return "healthy";
  if (c.vitality > 33n * VIT_PT) return "strained";
  return "failing";
}

/** Coarse life-cycle label (A9) — for UI/prompt only; not load-bearing for invariants. */
export function lifeStage(salary: bigint, c: CharState, cfg: EconConfig): LifeStage {
  if (c.livedDays === 0n) return "birth";
  const nf = netFlow(salary, c, cfg);
  const vs = vitalityState(c);
  if (nf < 0n && (vs === "failing" || vs === "strained")) return "decline";
  if (c.heldSlot && nf > 0n && vs === "healthy") return "golden";
  const overAge = ageNowMilliYears(c) - c.cfg.onsetMilliYears > 0n;
  if (overAge || c.memoryCount > 600n) return "aging";
  return "growth";
}
