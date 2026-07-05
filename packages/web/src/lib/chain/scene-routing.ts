/**
 * Scene turn routing (§2.55 fix) — pure math, no LLM. Being addressed pulls
 * you into the exchange, but every beat you take builds in-scene fatigue; a
 * hot bystander eventually outbids a worn ping-pong pair, so a duel can no
 * longer monopolize a crowded scene. Two-person scenes are unaffected (the
 * only candidate always wins).
 */

export const ROUTING = {
    /** Score bonus for the character the last beat addressed — a spoken-to
     *  person owes a response, but not forever. */
    addressedBonus: 0.15,
    /** Score penalty per beat already taken this scene. */
    fatiguePenalty: 0.12,
} as const;

export interface NextActorCandidate {
    characterId: string;
    /** Hottest-want tension (−1 when the character has no live want). */
    tension: number;
    /** Beats this character has already taken in this scene. */
    beatsTaken: number;
    isAddressed: boolean;
}

export function turnScore(c: NextActorCandidate): number {
    return c.tension - ROUTING.fatiguePenalty * c.beatsTaken + (c.isAddressed ? ROUTING.addressedBonus : 0);
}

/** Highest score wins; the addressed candidate wins exact ties. */
export function pickNextActor(candidates: NextActorCandidate[]): string | null {
    let best: NextActorCandidate | null = null;
    for (const c of candidates) {
        if (!best) {
            best = c;
            continue;
        }
        const d = turnScore(c) - turnScore(best);
        if (d > 0 || (d === 0 && c.isAddressed && !best.isAddressed)) best = c;
    }
    return best?.characterId ?? null;
}
