// Fixed-point arithmetic primitives. Move-mappable, byte-for-byte deterministic.
//
// WHY bigint (not number): the spec interfaces illustrate fields as `number`, but JS
// `number` is float64 — it cannot represent u128 intermediates (> 2^53) and float rounding
// is not guaranteed identical across engines. Both break the load-bearing property:
// "anyone re-runs applyTick → reproduces the exact next state, byte-for-byte" (spec §3, §7).
// `bigint` is exact integer arithmetic, maps 1:1 onto Move u64/u128, and matches how Sui
// already serializes u64 (as decimal strings) in JSON. So every domain value and every
// intermediate is a `bigint`.
//
// Domains (held by construction; asserted in tests, never enforced by a runtime clamp):
//   - "scaled" values live in [0n, SCALE]            -> conceptually a Move u64
//   - intermediates (a*b before /SCALE) reach ~SCALE^2 ≈ 1e12 -> a Move u128

/** Fixed-point scale. A scaled value of SCALE represents 1.0. */
export const SCALE = 1_000_000n;
export const ZERO = 0n;

/**
 * (a * b) / SCALE with bigint truncation toward zero.
 *
 * Truncation toward zero is load-bearing for "bounded without clamp": for a convex move
 * `rate * (target - s) / SCALE` with rate ∈ [0, SCALE], the magnitude of the result is
 * always ≤ |target - s| and shares its sign, so the step never overshoots `target` in
 * either direction. bigint `/` truncates toward zero for both signs, so this holds
 * symmetrically for gains and losses. See applyTick's relaxation/habituation steps.
 */
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

/**
 * True iff `v` is a scaled value in [0, SCALE]. Tests use this to prove boundedness holds
 * by construction. Not called on the hot path.
 */
export function isScaled(v: bigint): boolean {
  return v >= ZERO && v <= SCALE;
}
