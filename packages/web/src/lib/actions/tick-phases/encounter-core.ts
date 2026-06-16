/**
 * Encounter selection — pure core (no chain, no I/O). Split from `encounter.ts`
 * so the selection logic is unit-testable under `node --test` with a node-clean
 * import graph. `encounter.ts` fetches the on-chain relationship pairs, then calls
 * `selectEncounterPair` here.
 */

import type { RelationshipTone } from '@endless-story/shared';

/**
 * Bond tones worth a 溫情/關係戲 encounter — both the warm (親近/戀慕/師徒) and the
 * charged (競爭/緊張/隔閡 = 蒼涼／未了) registers the runner's encounter branch is
 * written for. Excludes wary/acquaintance/neutral (too thin). Data-driven: this
 * set is the only place tones are gated.
 */
export const ENCOUNTER_TONES: ReadonlySet<RelationshipTone> = new Set<RelationshipTone>([
    'affection',
    'romance',
    'mentorship',
    'rivalry',
    'tension',
    'estrangement',
]);

/** The WARM register (溫情) — preferred over the charged register at equal strength so
 *  tenderness actually surfaces instead of every encounter being a rivalry/tension beat.
 *  The story was「充滿爭搶、沒溫情」partly because charged ties won the selector's tiebreak. */
export const WARM_TONES: ReadonlySet<RelationshipTone> = new Set<RelationshipTone>([
    'affection',
    'romance',
    'mentorship',
]);

/** Min seed count to qualify. 1 = a single induction seed is enough (else encounters
 *  never fire autonomously); 養關係 deepens count and the selector prefers higher. */
export const ENCOUNTER_STRENGTH = 1;

export interface RelationshipPair {
    otherId: string;
    tone: RelationshipTone;
    count: number;
}

export interface EncounterPair {
    holderId: string;
    otherId: string;
    otherName: string;
    tone: RelationshipTone;
    toneZh: string;
    count: number;
    pairKey: string;
}

/** Order-independent key for a pair (sorted ids) so A↔B and B↔A collide. */
export function encounterPairKey(a: string, b: string): string {
    return [a, b].sort().join('::');
}

/**
 * Find the SINGLE strongest co-present bonded pair, given each candidate's
 * already-fetched relationship pairs. Pure + deterministic: keeps edges where both
 * sides are candidates, co-present (same scene), bonded by an encounter tone with
 * count ≥ threshold; picks the strongest (count, then a stable key tiebreak);
 * holder = lexicographically-first id. Returns undefined when none qualify.
 */
export function selectEncounterPair(
    perChar: ReadonlyArray<{ id: string; pairs: ReadonlyArray<RelationshipPair> }>,
    sceneIdOf: (id: string) => string | undefined,
    nameOf: (id: string) => string | undefined,
    toneLabel: (tone: RelationshipTone) => string,
): EncounterPair | undefined {
    const ids = new Set(perChar.map((c) => c.id));
    let best: EncounterPair | undefined;
    const seen = new Set<string>();
    for (const { id, pairs } of perChar) {
        const sceneA = sceneIdOf(id);
        if (!sceneA) continue;
        for (const p of pairs) {
            if (!ids.has(p.otherId)) continue;
            if (!ENCOUNTER_TONES.has(p.tone)) continue;
            if (p.count < ENCOUNTER_STRENGTH) continue;
            const sceneB = sceneIdOf(p.otherId);
            if (!sceneB || sceneB !== sceneA) continue;
            const key = encounterPairKey(id, p.otherId);
            if (seen.has(key)) continue;
            seen.add(key);
            const [holderId, otherId] = [id, p.otherId].sort();
            const cand: EncounterPair = {
                holderId,
                otherId,
                otherName: nameOf(otherId) ?? '某人',
                tone: p.tone,
                toneZh: toneLabel(p.tone),
                count: p.count,
                pairKey: key,
            };
            // Prefer: stronger bond → then the WARM register (so 溫情 surfaces, not just
            // charged rivalry/tension) → then a stable key. With seeded ties all at
            // count=1, this makes a warm pair win over a charged one in the same scene.
            const warmth = (c: EncounterPair) => (WARM_TONES.has(c.tone) ? 1 : 0);
            const better =
                !best ||
                cand.count > best.count ||
                (cand.count === best.count && warmth(cand) > warmth(best)) ||
                (cand.count === best.count && warmth(cand) === warmth(best) && cand.pairKey < best.pairKey);
            if (better) best = cand;
        }
    }
    return best;
}

/**
 * Generic, no-hardcoded-copy trigger narrative for the encounter chapter. Names
 * the counterpart + conveys the relationship NATURE via the tone label; the runner
 * supplies the craft framing (one shared chore, subtext, no winner).
 */
export function buildEncounterTrigger(pair: EncounterPair, dayLabel: string): string {
    return (
        `${dayLabel} — 此刻你與${pair.otherName}恰好獨處一隅。` +
        `你們之間有一段「${pair.toneZh}」的牽連，擺在檯面下，誰也不先點破。` +
        `寫這一刻你們共做一件具體的瑣事，讓那層沒說破的東西在動作底下走；不要競爭、不要輸贏，只露一角，結尾讓它極輕地動一寸。`
    );
}
