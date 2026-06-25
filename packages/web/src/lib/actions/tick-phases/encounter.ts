/**
 * Encounter detection — autonomous 溫情/關係戲 pair selection for the tick loop.
 *
 * Data-driven + flexible: tones and the bonded "other" come from on-chain
 * director-seeded RelationshipSeeded events (relationships.ts), never hardcoded
 * names. The loop calls `pickEncounterPair` once per tick to find the SINGLE
 * strongest co-present bonded pair. The pure selection lives in `encounter-core.ts`
 * (node-clean, unit-tested); this module only adds the chain fetch.
 */

import { fetchRelationshipPairs, toneLabel } from '@/lib/chain/relationships';
import { selectEncounterPair, type EncounterPair } from './encounter-core.ts';

export { encounterPairKey, buildEncounterTrigger, buildConfessTrigger, type EncounterPair } from './encounter-core.ts';

/**
 * Fetch each candidate's seeded relationship pairs, then pick the strongest
 * co-present bonded pair (pure `selectEncounterPair`). Returns undefined when none
 * qualify.
 */
export async function pickEncounterPair(
    candidates: { id: string }[],
    sceneIdOf: (id: string) => string | undefined,
    nameOf: (id: string) => string | undefined,
): Promise<EncounterPair | undefined> {
    const perChar = await Promise.all(
        candidates.map(async (c) => ({ id: c.id, pairs: await fetchRelationshipPairs(c.id) })),
    );
    return selectEncounterPair(perChar, sceneIdOf, nameOf, toneLabel);
}
