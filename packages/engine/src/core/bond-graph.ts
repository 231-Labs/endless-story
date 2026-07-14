/**
 * Bond graph — the NUMERIC underlay of relationships (directed, asymmetric).
 * ============================================================================
 * Ported from the research line's cooling-engine findings (§2.1/2.4): a
 * one-line text view says WHAT a heart believes; the bond value says HOW MUCH
 * time two lives have actually braided. Numbers NEVER enter a prompt — they
 * gate world affordances (an intimacy advance needs standing) and feed the
 * ledgers. Choices stay the characters' own.
 *
 *   growth (per shared scene):  bond += α · warmth · (1 − bond)   [saturating]
 *   cooling (per day apart):    bond ← floor + (bond − floor)·μ
 *   floor = FLOOR_OF_PEAK · historical peak — an old flame cools, but never
 *   back to stranger (this is what keeps confess/rekindle arcs alive, the
 *   research line's ⚠️ about cooling starving romance).
 */

export const BOND = {
    /** growth rate per shared scene (before warmth multiplier + saturation). */
    alpha: 0.06,
    /** warmth multipliers by what the scene actually was. */
    warmth: { shared: 1.0, private: 1.5, confide: 2.0, confided: 1.5, accept: 3.0, bed: 4.0 } as Record<string, number>,
    /** per-day cooling factor for a pair that did NOT share a scene. */
    mu: 0.985,
    /** an old flame never cools below this fraction of its historical peak. */
    floorOfPeak: 0.3,
    /** standing needed before the world even offers the advance affordance. */
    advanceAt: 0.45,
    /** seeds (data-driven from canon, never name-cased). */
    seed: { established: 0.75, yearning: 0.6, known: 0.35, stranger: 0.15 },
} as const;

export interface BondEdge {
    /** current bond a→b (0..1). */
    v: number;
    /** historical peak (sets the cooling floor). */
    peak: number;
}

/** 'a→b' key. Directed: v(a→b) need not equal v(b→a) — 單戀 is a real shape. */
export type BondGraph = Map<string, BondEdge>;

const key = (from: string, to: string): string => `${from}→${to}`;

export function bondOf(g: BondGraph, from: string, to: string): number {
    return g.get(key(from, to))?.v ?? BOND.seed.stranger;
}

export function seedBond(g: BondGraph, from: string, to: string, v: number): void {
    const k = key(from, to);
    const e = g.get(k);
    if (!e || e.v < v) g.set(k, { v, peak: Math.max(v, e?.peak ?? 0) });
}

/** A shared scene warms BOTH directions (each by its own saturation). */
export function bumpBond(g: BondGraph, a: string, b: string, kind: keyof typeof BOND.warmth | string): void {
    const w = BOND.warmth[kind] ?? 1.0;
    for (const [f, t] of [
        [a, b],
        [b, a],
    ] as const) {
        const k = key(f, t);
        const e = g.get(k) ?? { v: BOND.seed.stranger, peak: BOND.seed.stranger };
        e.v = Math.min(1, e.v + BOND.alpha * w * (1 - e.v));
        e.peak = Math.max(e.peak, e.v);
        g.set(k, e);
    }
}

/** Nightly cooling for every edge whose pair did NOT share a scene today.
 *  `togetherToday` holds sorted 'idA|idB' pair keys that met. */
export function decayBonds(g: BondGraph, togetherToday: Set<string>): void {
    for (const [k, e] of g) {
        const [from, to] = k.split('→');
        if (togetherToday.has([from, to].sort().join('|'))) continue;
        const floor = BOND.floorOfPeak * e.peak;
        e.v = floor + (e.v - floor) * BOND.mu;
    }
}

/** The world offers the advance affordance only on real standing. */
export function advanceReady(g: BondGraph, from: string, to: string): boolean {
    return bondOf(g, from, to) >= BOND.advanceAt;
}

/** (De)serialization for the season snapshot. */
export function bondsToJSON(g: BondGraph): Array<{ k: string; v: number; peak: number }> {
    return [...g.entries()].map(([k, e]) => ({ k, v: e.v, peak: e.peak }));
}
export function bondsFromJSON(rows: Array<{ k: string; v: number; peak: number }> | undefined): BondGraph {
    const g: BondGraph = new Map();
    for (const r of rows ?? []) g.set(r.k, { v: r.v, peak: r.peak });
    return g;
}
