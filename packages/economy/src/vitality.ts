// vitality.ts — the per-day vitality transition (dual-track death), extracted as a pure step.
//
// Lifted out of settleDay so the death model can be unit-tested in ISOLATION from cohort
// payroll. Two tracks combine each day:
//   • economic-death track — insolvency streak → accelerating damage (econBase × streak),
//     mirroring drama loss-aversion (~5 insolvent days from full kills).
//   • age-hazard track — decision ⑤: NO stored lifespan; risk emerges only past a hidden,
//     per-character onset and rises with age (ageHazard, 0 before onset).
// Both settleDay and the web lazy-settle shadow call THIS — the vitality math lives in one
// place, so a Move port (economy.move) reproduces it byte-for-byte.

import { bclamp } from "./fixed.ts";
import { ageHazard } from "./derive.ts";
import { VIT_FULL, type CharState, type EconConfig } from "./types.ts";

export interface VitalityStep {
  /** new vitality, milli-points, clamped to [0, VIT_FULL]. */
  vitality: bigint;
  /** new consecutive-insolvency streak (0 when solvent). */
  insolventStreak: bigint;
  /** vitality bottomed out this day. */
  dead: boolean;
  // ── breakdown (tests / UI tracing; not load-bearing) ──
  econDamage: bigint;
  ageHaz: bigint;
  recovery: bigint;
}

/**
 * Advance one character's vitality one day, given whether it was insolvent at settlement.
 * Pure: reads `c` (incl. its pre-increment `livedDays` for the age hazard) but never mutates it.
 *   solvent   → +vitRecovery, streak resets to 0
 *   insolvent → streak++, −econBase·streak (accelerating)
 *   always    → −ageHazard (0 before the hidden onset, rising with age)
 */
export function stepVitality(c: CharState, insolvent: boolean, cfg: EconConfig): VitalityStep {
  const insolventStreak = insolvent ? c.insolventStreak + 1n : 0n;
  const econDamage = insolvent ? cfg.econBase * insolventStreak : 0n;
  const recovery = insolvent ? 0n : cfg.vitRecovery;
  const ageHaz = ageHazard(c, cfg);
  const vitality = bclamp(c.vitality + recovery - econDamage - ageHaz, 0n, VIT_FULL);
  return { vitality, insolventStreak, dead: vitality <= 0n, econDamage, ageHaz, recovery };
}
