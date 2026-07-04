/**
 * Encounter selection — pure core (no chain, no I/O), split from `encounter.ts`
 * so it is unit-testable under `node --test` with a node-clean import graph.
 */

import type { RelationshipTone } from '@endless-story/shared';

/** Bond tones worth an encounter (warm + charged registers). Excludes
 *  wary/acquaintance/neutral; this set is the only place tones are gated. */
export const ENCOUNTER_TONES: ReadonlySet<RelationshipTone> = new Set<RelationshipTone>([
    'affection',
    'romance',
    'mentorship',
    'rivalry',
    'tension',
    'estrangement',
]);

/** The warm register — preferred over the charged one at equal strength, so
 *  tenderness surfaces instead of every encounter being a rivalry/tension beat. */
export const WARM_TONES: ReadonlySet<RelationshipTone> = new Set<RelationshipTone>([
    'affection',
    'romance',
    'mentorship',
]);

/** Min seed count to qualify; 1 so a single induction seed is enough, else
 *  encounters never fire autonomously. Bond deepening raises count. */
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

/** Find the single strongest co-present bonded pair. Pure + deterministic;
 *  holder = lexicographically-first id; undefined when none qualify. */
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
            // Prefer stronger bond → warm register → stable key tiebreak.
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

/** Generic trigger narrative for the encounter chapter (no hardcoded copy). */
export function buildEncounterTrigger(pair: EncounterPair, dayLabel: string): string {
    return (
        `${dayLabel} — 此刻你與${pair.otherName}恰好獨處一隅。` +
        `你們之間有一段「${pair.toneZh}」的牽連，擺在檯面下，誰也不先點破。` +
        `寫這一刻你們共做一件具體的瑣事，讓那層沒說破的東西在動作底下走；不要競爭、不要輸贏，只露一角，結尾讓它極輕地動一寸。`
    );
}

/** Trigger for the CONFESS branch — unlike buildEncounterTrigger, this scene IS
 *  the confession; `opening`/`motive` come from the character's own decision. */
export function buildConfessTrigger(
    pair: EncounterPair,
    dayLabel: string,
    opening: string,
    motive: string,
): string {
    const said = opening ? `你開口的第一句是:「${opening}」。` : '';
    const why = motive ? `（你心裡:${motive}）` : '';
    return (
        `${dayLabel} — 此刻你與${pair.otherName}恰好獨處一隅。你們之間那段「${pair.toneZh}」的牽連，` +
        `揣了很久、誰也沒先點破;今夜你決定不再藏，把心意說開了。${said}${why}` +
        `寫這一刻你終於攤牌的場景:你怎麼開口、${pair.otherName}怎麼接(或怎麼怔住、躲閃、回應)，那層窗紙怎麼被你捅破。` +
        `這一回**要**點破，不再只露一角;結尾停在話既出口、你們之間從此不同的那一刻。`
    );
}
