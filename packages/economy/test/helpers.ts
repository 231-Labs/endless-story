// Shared test helpers. NOT a *.test.ts so `node --test test/` won't execute it directly.

/**
 * Canonical serialization: recursively sorted object keys + bigints as `<n>n` strings.
 * Order-independent, so deep-equality compares VALUES not JS insertion order — the honest
 * stand-in for the on-chain "byte-for-byte" guarantee.
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

/** Deterministic LCG (no Math.random — tests must be reproducible). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}
