/**
 * Encounter detection — data-driven pair selection for the tick loop. Tones and
 * pairs come from on-chain RelationshipSeeded events, never hardcoded names.
 * Pure selection lives in `encounter-core.ts`; this module adds the chain fetch.
 */

import { fetchRelationshipPairs, toneLabel } from '@/lib/chain/relationships';
import { selectEncounterPair, type EncounterPair } from './encounter-core.ts';

export { encounterPairKey, buildEncounterTrigger, buildConfessTrigger, type EncounterPair } from './encounter-core.ts';

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
