'use server';

/**
 * Server action — invoke runner character-worker with admin keypair.
 *
 * Admin-only entry (gated upstream in the page / button). Bypasses
 * subscriber gate via `forceRun`. Returns chapter prose + commitment
 * ref so the UI can render + link to chain. Per-character logic lives
 * in `lib/chain/pov-core.ts` (shared with the daily batch).
 */

import { getAdminContext } from '@/lib/chain/admin-signer';
import { runPovForCharacter, type PovCoreResult } from '@/lib/chain/pov-core';

export interface RunPovInput {
    characterId: string;
    /** Override the trigger narrative — when empty, server falls back to
     *  a neutral scene prompt instead of an introspection prompt. */
    triggerNarrative?: string;
    forceRun?: boolean;
    dryRun?: boolean;
}

export type RunPovResult = PovCoreResult;

export async function runPovAction(input: RunPovInput): Promise<RunPovResult> {
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            anchored: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    const triggerNarrative =
        input.triggerNarrative?.trim() ||
        '請截取這個角色此刻的一個具體場面：他身在何處、看見誰或避開誰、手上正在做什麼、眼下有什麼利害。';

    return runPovForCharacter(admin, input.characterId, {
        triggerNarrative,
        forceRun: input.forceRun ?? true, // admin trigger always bypasses
        dryRun: input.dryRun,
    });
}
