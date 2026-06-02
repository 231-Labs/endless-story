// Fixed-point arithmetic primitives. Move-mappable, byte-for-byte deterministic.
// Copied verbatim from @endless-story/drama/src/fixed.ts — same load-bearing property:
// "anyone re-runs settleDay → reproduces the exact next state, byte-for-byte".
//
// WHY bigint (not number): JS `number` is float64 — it cannot represent u128 intermediates
// (> 2^53) and float rounding is not guaranteed identical across engines. bigint is exact
// integer arithmetic and maps 1:1 onto Move u64/u128 (and Sui already serializes u64 as
// decimal strings). So every domain value and every intermediate is a `bigint`.

/** Fixed-point scale. A scaled value of SCALE represents 1.0. */
export const SCALE = 1_000_000n;
export const ZERO = 0n;

/** (a * b) / SCALE with bigint truncation toward zero. */
export function mulScale(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE;
}

/** (a * b) / denom with bigint truncation toward zero. `denom` must be > 0. */
export function mulDiv(a: bigint, b: bigint, denom: bigint): bigint {
  return (a * b) / denom;
}

/** Deterministic bigint min/max (never Math.min — that coerces through float64). */
export function bmin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
export function bmax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Clamp v into [lo, hi]. */
export function bclamp(v: bigint, lo: bigint, hi: bigint): bigint {
  return v < lo ? lo : v > hi ? hi : v;
}

/** True iff `v` is a scaled value in [0, SCALE]. */
export function isScaled(v: bigint): boolean {
  return v >= ZERO && v <= SCALE;
}
