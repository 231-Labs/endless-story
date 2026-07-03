/**
 * Actor fatigue — spotlight rotation across the CAST (pure; no chain, no I/O).
 *
 * §2.51 (dream-butterfly dosimetry) proved the failure mode: one very-high-weight,
 * never-resolving standing desire forms a tension FLOOR (≈0.72 in the lab) that wins
 * the selection every tick. That monopoly is not just a breadth/aesthetic problem —
 * it structurally swallows every outside perturbation (an injected dream, a newborn
 * character) because the perturbed character never wins salience, so their memory is
 * never "recalled into action". The same lab showed the fix that works: acting costs
 * fatigue, fatigue suppresses EFFECTIVE tension, and the spotlight rotates (the
 * dreamer surfaced her dream publicly only in the fatigue arm).
 *
 * This is the daily-life state layer consumed INTO selection — a mechanism, not a
 * knob: people who just carried a scene are spent; spent people don't dominate the
 * next beat. It scales only the SELECTION overlay (which contention gets staged);
 * the raw tension rows that feed spine SETTLEMENT (contest.ts economics, §2.35
 * deterministic winner) are never touched, and neither is the committed drama beat.
 *
 * Sits beside `attention-core.ts` (intra-character desire coupling); this is the
 * inter-character counterpart. Flag-gated (`TICK_ACTOR_FATIGUE`); identity when off.
 * Pure + unit-tested (`actor-fatigue.test.ts`).
 */

/** Per-character spotlight fatigue, 0..cap (module keeps it per saga, in-memory). */
export type FatigueLedger = Readonly<Record<string, number>>;

/** Lab-validated constants (§2.51 D arm): cost per featured beat, per-tick recovery,
 *  effective-tension penalty per fatigue unit, and the suppression ceiling. */
export const ACTOR_FATIGUE = {
    /** fatigue gained by each participant of a live (open/continuing) event. */
    cost: 1,
    /** fatigue recovered per tick (applied once, before selection). */
    decay: 0.35,
    /** effective tension × (1 − penalty × min(fatigue, cap)). */
    penalty: 0.28,
    /** fatigue above this suppresses no further (keeps the scale bounded). */
    cap: 2.5,
} as const;

/** One tick of rest for everyone. Entries that reach 0 are dropped. */
export function decayActorFatigue(ledger: FatigueLedger): FatigueLedger {
    const next: Record<string, number> = {};
    for (const [id, v] of Object.entries(ledger)) {
        const rested = v - ACTOR_FATIGUE.decay;
        if (rested > 0) next[id] = rested;
    }
    return next;
}

/** The given characters just carried a live event — they tire. */
export function bumpActorFatigue(ledger: FatigueLedger, characterIds: ReadonlyArray<string>): FatigueLedger {
    if (characterIds.length === 0) return ledger;
    const next: Record<string, number> = { ...ledger };
    for (const id of characterIds) {
        next[id] = Math.min(ACTOR_FATIGUE.cap, (next[id] ?? 0) + ACTOR_FATIGUE.cost);
    }
    return next;
}

/**
 * Scale each row's tension by its OWNER's rest. Fresh characters pass through
 * unchanged; a character who just carried a scene has their rows suppressed, so
 * the next selection naturally swings to whoever has been offstage. Preserves
 * row identity + extra fields; returns a new array (input untouched). With an
 * empty ledger it's the identity.
 */
export function applyActorFatigue<T extends { characterId: string; tension: number }>(
    rows: ReadonlyArray<T>,
    ledger: FatigueLedger,
): T[] {
    return rows.map((r) => {
        const fat = ledger[r.characterId] ?? 0;
        if (fat <= 0) return { ...r };
        const factor = 1 - ACTOR_FATIGUE.penalty * Math.min(fat, ACTOR_FATIGUE.cap);
        return { ...r, tension: Math.max(0, r.tension * factor) };
    });
}
