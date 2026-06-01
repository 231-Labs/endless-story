// Shared test helpers. NOT a *.test.ts so `node --test test/` won't execute it directly,
// but it can be imported by the real test files.

import type { TuningConfig, WorldState } from "../src/index.ts";

/**
 * Canonical serialization: recursively sorted object keys + bigints as `<n>n` strings.
 *
 * Order-independent by construction, so deep-equality over world states compares VALUES,
 * not incidental JS insertion order. This is also the honest stand-in for the on-chain
 * "byte-for-byte" guarantee: a real commitment would hash a canonical encoding (sorted /
 * BCS), never raw object-literal order. Arrays keep their order (it's semantic).
 */
export function serialize(value: unknown): string {
  const canon = (v: unknown): unknown => {
    if (typeof v === "bigint") return `${v}n`;
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = canon((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(canon(value));
}

/** A baseline tuning config used across tests (loss aversion: alphaDown > alphaUp). */
export const TUNING: TuningConfig = {
  alphaUp: 300_000n,
  alphaDown: 700_000n,
  gamma: 50_000n,
};

/** Deterministic LCG (no Math.random — tests must themselves be reproducible). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000; // [0,1)
  };
}

/** Pick a scaled bigint in [0, SCALE] from a [0,1) float, deterministically. */
export function scaledFrom(r: number, scale = 1_000_000n): bigint {
  return BigInt(Math.floor(r * Number(scale + 1n)));
}

export type { WorldState };
