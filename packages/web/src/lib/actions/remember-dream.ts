'use server';

/**
 * Persist an owner-injected dream into MemWal at top importance (§5.2: dreams
 * must surface first), called after the dream is anchored on chain. Also queues
 * the §2.51 appraisal stir. Best-effort — never blocks the dream tx.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { rememberForCharacter } from '@/lib/chain/memory';
import { queueDreamStir } from '@/lib/chain/drama';
import { queueWantDreamStir } from '@/lib/chain/want-store';

export interface RememberDreamResult {
    ok: boolean;
    remembered: boolean;
}

export async function rememberDreamAction(
    characterId: string,
    dreamText: string,
): Promise<RememberDreamResult> {
    if (!dreamText.trim()) return { ok: false, remembered: false };
    // §2.51: a dream that only sits in memory is inert — the effective dose is
    // memory + one appraisal stir consumed by the next drama beat. Queue even
    // when MemWal is unconfigured (the dream is already anchored on chain).
    queueDreamStir(ENDLESS_STORY_DEPLOYMENT.sagaId, characterId);
    queueWantDreamStir(ENDLESS_STORY_DEPLOYMENT.sagaId, characterId);
    try {
        const remembered = await rememberForCharacter(characterId, dreamText, {
            kind: 'dream',
            importance: 9,
        });
        return { ok: true, remembered };
    } catch {
        return { ok: false, remembered: false };
    }
}
