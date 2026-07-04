/**
 * Actor fatigue — spotlight rotation across the cast (pure; no chain, no I/O).
 * §2.51: acting costs fatigue; fatigue suppresses EFFECTIVE tension at SELECTION
 * only, breaking the monopoly where one standing desire wins every tick. Raw
 * tension rows feeding spine settlement and the committed drama beat are never
 * touched. Flag-gated (`TICK_ACTOR_FATIGUE`); identity when off.
 */

/** Per-character spotlight fatigue, 0..cap. */
export type FatigueLedger = Readonly<Record<string, number>>;

/** Lab-validated constants (§2.51 D arm). */
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

/** One tick of rest for everyone; entries that reach 0 are dropped. */
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

/** Scale each row's tension by its owner's rest. Returns a new array (input
 *  untouched); an empty ledger is the identity. */
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
