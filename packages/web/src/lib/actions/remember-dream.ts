'use server';

/**
 * Persist an owner-injected dream into the character's MemWal memory at
 * top importance (proposal §5.2: dreams must surface first and not get
 * compressed away). Called after the dream is anchored on chain (client
 * signs dream::submit_dream); this adds the weighted memory layer on top
 * so future POV / reflection recalls reliably pull the dream.
 *
 * Also queues the §2.51 appraisal stir (dream must stir demand, not just sit in
 * memory). Memory write is a no-op when MemWal unconfigured; the stir still
 * queues. Best-effort — never blocks the dream tx.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { rememberForCharacter } from '@/lib/chain/memory';
import { queueDreamStir } from '@/lib/chain/drama';

export interface RememberDreamResult {
    ok: boolean;
    remembered: boolean;
}

export async function rememberDreamAction(
    characterId: string,
    dreamText: string,
): Promise<RememberDreamResult> {
    if (!dreamText.trim()) return { ok: false, remembered: false };
    // §2.51 dosimetry: a dream that only sits in memory is INERT — the dreamer
    // never wins salience, so it is never recalled into action. The effective
    // dose is memory + ONE appraisal stir (a ripple-tighten on her hottest
    // desire, consumed by the next drama beat). Queue it even when MemWal is
    // unconfigured: the dream itself is already anchored on chain by now.
    // (No cred pre-check: rememberForCharacter routes to the observatory's
    // in-memory store under ES_NARRATIVE, and gracefully returns false on the
    // real path when MemWal creds are absent.)
    queueDreamStir(ENDLESS_STORY_DEPLOYMENT.sagaId, characterId);
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
