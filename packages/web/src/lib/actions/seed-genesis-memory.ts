'use server';

/**
 * Seed a freshly-minted character's genesis memories into MemWal.
 *
 * Generates first-person opening memories from the character's
 * description (runner genesis-memory service) and writes each into the
 * character's MemWal namespace. This is what stops early POV chapters
 * from drifting the persona — they now have something to recall.
 *
 * No-op when MemWal isn't configured (returns seeded: 0). Safe to call
 * after every mint; idempotency is loose (MemWal appends), so callers
 * should only invoke once per character at creation.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { genesisMemory as runnerGenesis } from '@endless-story/runner';
import { resolveRole } from '@/lib/chain/pov-core';
import {
    isMemoryConfigured,
    rememberForCharacter,
} from '@/lib/chain/memory';

export interface SeedGenesisResult {
    ok: boolean;
    seeded: number;
    generated: number;
    skipped?: 'memory_unconfigured' | 'character_unreachable';
    error?: string;
}

export async function seedGenesisMemoryAction(
    characterId: string,
    count = 6,
): Promise<SeedGenesisResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) {
        return { ok: false, seeded: 0, generated: 0, error: 'saga 尚未種子化' };
    }
    if (!isMemoryConfigured()) {
        // No MemWal creds → nothing to seed into. Not an error: the mint
        // already succeeded; memory is an enhancement layer.
        return { ok: true, seeded: 0, generated: 0, skipped: 'memory_unconfigured' };
    }

    try {
        const role = await resolveRole(characterId);
        const res = await runnerGenesis.runOnce({
            characterId,
            sagaId: d.sagaId,
            role,
            count,
        });
        if (res.skipReason) {
            return { ok: false, seeded: 0, generated: 0, skipped: res.skipReason };
        }

        let seeded = 0;
        for (const memory of res.memories) {
            const wrote = await rememberForCharacter(characterId, memory, {
                kind: 'genesis',
            });
            if (wrote) seeded += 1;
        }
        return { ok: true, seeded, generated: res.memories.length };
    } catch (err) {
        return {
            ok: false,
            seeded: 0,
            generated: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
