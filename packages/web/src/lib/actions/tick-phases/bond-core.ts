/**
 * 養關係 selection — pure core (no chain, no I/O). Split from `bond.ts` so the
 * "which pairs to deepen" logic is unit-testable. `bond.ts` keeps the chain write.
 */

export interface BondPair {
    aId: string;
    bId: string;
    /** Scene the bonding act happened in (relationship_seed needs a scene). */
    sceneId: string;
    /** Relationship tone to deepen toward (a gift reads as warmth → 親近). */
    tone: string;
}

export interface GiveLike {
    characterId: string;
    ok: boolean;
    gave: boolean;
    gifts?: Array<{ recipientId: string; refused?: boolean }>;
}

/**
 * Collect the pairs to deepen from this tick's GIVE results: each ACCEPTED,
 * non-refused gift is one bonding act. Dedup symmetric pairs, cap the count, and
 * resolve the scene from the live roster (giver's, else recipient's, else the
 * `fallbackScene`). Pure. A gift reads as warmth → tone 'affection'.
 */
export function collectBondPairs(
    gives: ReadonlyArray<GiveLike>,
    sceneIdOf: (id: string) => string | undefined,
    fallbackScene: string | undefined,
    max = 4,
): BondPair[] {
    const out: BondPair[] = [];
    const seen = new Set<string>();
    for (const g of gives) {
        if (!g.ok || !g.gave) continue;
        for (const gift of g.gifts ?? []) {
            if (gift.refused || !gift.recipientId || gift.recipientId === g.characterId) continue;
            const key = [g.characterId, gift.recipientId].sort().join('::');
            if (seen.has(key)) continue;
            const sceneId = sceneIdOf(g.characterId) ?? sceneIdOf(gift.recipientId) ?? fallbackScene;
            if (!sceneId) continue;
            seen.add(key);
            out.push({ aId: g.characterId, bId: gift.recipientId, sceneId, tone: 'affection' });
            if (out.length >= max) return out;
        }
    }
    return out;
}
