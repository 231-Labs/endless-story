/**
 * Saga Director — capability → PTB dispatch.
 *
 * Takes a validated `DirectorCapability` array and pushes the matching
 * Move calls onto a shared Transaction. Caller signs + executes.
 */

import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx } from '@endless-story/sdk';
import type { DirectorCapability } from '../../types/capabilities.js';

/**
 * Build a Transaction emitting all the director events for the given
 * capabilities. `sagaId` + `storytellerCapId` come from
 * `contract-ids.ts` snapshot (the caller passes them in to keep this
 * pure).
 */
export function buildDispatchTransaction(
    capabilities: DirectorCapability[],
    refs: { sagaId: string; storytellerCapId: string },
): Transaction {
    const tx = new Transaction();
    for (const cap of capabilities) {
        switch (cap.kind) {
            case 'open_storylet':
                tx.add(
                    endlessTx.director.openStorylet({
                        cap: refs.storytellerCapId,
                        saga: refs.sagaId,
                        templateId: cap.templateId,
                        sceneId: cap.sceneId,
                        characterIds: cap.characterIds,
                    }),
                );
                break;
            case 'attribute_pressure':
                tx.add(
                    endlessTx.director.attributePressure({
                        cap: refs.storytellerCapId,
                        saga: refs.sagaId,
                        sceneId: cap.sceneId,
                        axis: cap.axis,
                        deltaMagnitude: Math.abs(cap.delta),
                        isNegative: cap.delta < 0,
                    }),
                );
                break;
            case 'character_call':
                tx.add(
                    endlessTx.director.characterCall({
                        cap: refs.storytellerCapId,
                        saga: refs.sagaId,
                        sceneId: cap.sceneId,
                        characterId: cap.characterId,
                        reason: cap.reason ?? '',
                    }),
                );
                break;
            case 'relationship_seed':
                tx.add(
                    endlessTx.director.relationshipSeed({
                        cap: refs.storytellerCapId,
                        saga: refs.sagaId,
                        sceneId: cap.sceneId,
                        characterA: cap.characterA,
                        characterB: cap.characterB,
                        tone: cap.tone,
                    }),
                );
                break;
            case 'advance_phase':
                tx.add(
                    endlessTx.director.advancePhase({
                        cap: refs.storytellerCapId,
                        saga: refs.sagaId,
                        nextPhase: cap.nextPhase,
                    }),
                );
                break;
        }
    }
    return tx;
}
