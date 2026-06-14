/**
 * Encounter detection — autonomous 溫情/關係戲 pair selection for the tick loop.
 *
 * Data-driven + flexible: tones and the bonded "other" come from on-chain
 * director-seeded RelationshipSeeded events (relationships.ts), never hardcoded
 * names. The loop calls `pickEncounterPair` once per tick to find the SINGLE
 * strongest co-present bonded pair, then generates ONE quiet two-person chapter
 * via `runPovForCharacter(mode:'encounter')`.
 *
 * Pure selection (no chain mutation, no signing) — anchoring is the loop's job,
 * pushed into the serial cutJobs background so it never races the StorytellerCap.
 */

import type { RelationshipTone } from '@endless-story/shared';
import { fetchRelationshipPairs, toneLabel } from '@/lib/chain/relationships';

/**
 * Bond tones worth a 溫情/關係戲 encounter. We keep BOTH families the runner's
 * `encounter` branch is written for (it names 愛而不得 / 後輩追慕前輩的蒼涼 / 舊怨未了):
 *   - warm: 親近 / 戀慕 / 師徒 — the 溫情 register;
 *   - charged: 競爭 / 緊張 / 隔閡 — the 蒼涼／未了 register (still a relationship
 *     scene with tension under the action, NOT a competition with a winner).
 * Deliberately EXCLUDES wary / acquaintance / neutral: too thin for a whole
 * 關係戲. The set is data-driven — membership is the only place tones are gated.
 */
const ENCOUNTER_TONES: ReadonlySet<RelationshipTone> = new Set<RelationshipTone>([
    'affection',
    'romance',
    'mentorship',
    'rivalry',
    'tension',
    'estrangement',
]);

/** Minimum seed count for a tie to qualify for an encounter. A director-seeded
 *  bond tone is itself a deliberate authorial signal, and characters are seeded
 *  once per pair at induction (count = 1), so the GATE is 1 — otherwise encounters
 *  would essentially never fire in autonomous operation. Bonds then DEEPEN through
 *  behaviour: the 養關係 step (bond.ts) emits an extra seed when a pair helps each
 *  other, bumping count, and `pickEncounterPair` prefers the HIGHER count — so a
 *  deepened pair is favoured over a merely-introduced one. */
const ENCOUNTER_STRENGTH = 1;

export interface EncounterPair {
    /** POV holder (we generate from one side; the chapter still names the other). */
    holderId: string;
    /** The bonded counterpart in the same scene this tick. */
    otherId: string;
    otherName: string;
    tone: RelationshipTone;
    /** Chinese tone label (e.g. 戀慕 / 師徒 / 隔閡) for the trigger framing. */
    toneZh: string;
    /** Seed count of the tie (strength). */
    count: number;
    /** Stable, order-independent key for the cooldown guard. */
    pairKey: string;
}

/** Order-independent key for a pair (sorted ids) so A↔B and B↔A collide. */
export function encounterPairKey(a: string, b: string): string {
    return [a, b].sort().join('::');
}

/**
 * Find the SINGLE strongest co-present bonded pair among the candidates this
 * tick. `candidates` is the acting slice; `sceneIdOf` / `nameOf` read the live
 * roster (post-MOVE). Returns undefined when no pair qualifies.
 *
 * Flexible: we union each candidate's seeded pairs, keep only those where BOTH
 * sides are in the candidate set AND in the SAME scene AND bonded by an
 * encounter tone with count ≥ threshold, then pick the strongest (count, then
 * a stable key tiebreak). The holder is the lexicographically-first id so the
 * pair is deterministic regardless of slice order.
 */
export async function pickEncounterPair(
    candidates: { id: string }[],
    sceneIdOf: (id: string) => string | undefined,
    nameOf: (id: string) => string | undefined,
): Promise<EncounterPair | undefined> {
    const ids = new Set(candidates.map((c) => c.id));
    // Fetch each candidate's seeded pairs in parallel (best-effort, [] on fail).
    const perChar = await Promise.all(
        candidates.map(async (c) => ({
            id: c.id,
            pairs: await fetchRelationshipPairs(c.id),
        })),
    );

    let best: EncounterPair | undefined;
    const seen = new Set<string>();
    for (const { id, pairs } of perChar) {
        const sceneA = sceneIdOf(id);
        if (!sceneA) continue;
        for (const p of pairs) {
            if (!ids.has(p.otherId)) continue; // other not acting this tick
            if (!ENCOUNTER_TONES.has(p.tone)) continue; // tone too thin
            if (p.count < ENCOUNTER_STRENGTH) continue; // tie too faint
            const sceneB = sceneIdOf(p.otherId);
            if (!sceneB || sceneB !== sceneA) continue; // not co-present
            const key = encounterPairKey(id, p.otherId);
            if (seen.has(key)) continue; // dedup the symmetric edge
            seen.add(key);
            // Deterministic holder: the lexicographically-first id of the pair.
            const [holderId, partnerId] = [id, p.otherId].sort();
            const otherId = holderId === id ? p.otherId : id;
            const cand: EncounterPair = {
                holderId,
                otherId,
                otherName: nameOf(otherId) ?? '某人',
                tone: p.tone,
                toneZh: toneLabel(p.tone),
                count: p.count,
                pairKey: key,
            };
            void partnerId;
            if (
                !best ||
                cand.count > best.count ||
                (cand.count === best.count && cand.pairKey < best.pairKey)
            ) {
                best = cand;
            }
        }
    }
    return best;
}

/**
 * Generic, no-hardcoded-copy trigger narrative for the encounter chapter. Names
 * the counterpart and conveys the relationship NATURE via the tone label; the
 * runner's `encounter` branch supplies all the craft framing (one shared chore,
 * subtext, no winner). Stays flexible across any roster / tone.
 */
export function buildEncounterTrigger(pair: EncounterPair, dayLabel: string): string {
    return (
        `${dayLabel} — 此刻你與${pair.otherName}恰好獨處一隅。` +
        `你們之間有一段「${pair.toneZh}」的牽連，擺在檯面下，誰也不先點破。` +
        `寫這一刻你們共做一件具體的瑣事，讓那層沒說破的東西在動作底下走；不要競爭、不要輸贏，只露一角，結尾讓它極輕地動一寸。`
    );
}
