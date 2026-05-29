'use server';

/**
 * Persist an owner-injected dream into the character's MemWal memory at
 * top importance (proposal §5.2: dreams must surface first and not get
 * compressed away). Called after the dream is anchored on chain (client
 * signs dream::submit_dream); this adds the weighted memory layer on top
 * so future POV / reflection recalls reliably pull the dream.
 *
 * No-op when MemWal unconfigured. Best-effort — never blocks the dream tx.
 */

import { isMemoryConfigured, rememberForCharacter } from '@/lib/chain/memory';

export interface RememberDreamResult {
    ok: boolean;
    remembered: boolean;
}

export async function rememberDreamAction(
    characterId: string,
    dreamText: string,
): Promise<RememberDreamResult> {
    if (!dreamText.trim()) return { ok: false, remembered: false };
    if (!isMemoryConfigured()) return { ok: true, remembered: false };
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
