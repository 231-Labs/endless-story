'use server';

/**
 * Seed a freshly-minted character's genesis memories into MemWal.
 *
 * Generates first-person opening memories from the character's
 * description (runner genesis-memory service) and writes each into the
 * character's MemWal namespace. This is what stops early POV chapters
 * from drifting the persona — they now have something to recall.
 *
 * SCOPE: genesis writes ONLY the character's own life (selfMemories).
 * Cross-character relationships — first impressions AND pre-existing 故舊 —
 * are owned by the relationship-assess pass (assess-relationships.ts):
 * symmetric public director ties + dual-side memories, mint-ordering-fixed.
 * Keeping relationships out of genesis avoids the contradiction where genesis
 * (hard-restricted to first-impressions) and assess (allows prior shared past)
 * wrote conflicting memories about the same pair.
 *
 * No-op when MemWal isn't configured (returns seeded: 0). Safe to call
 * after every mint; idempotency is loose (MemWal appends), so callers
 * should only invoke once per character at creation.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { genesisMemory as runnerGenesis } from '@endless-story/runner';
import { resolveRole } from '@/lib/chain/pov-core';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import {
    isMemoryConfigured,
    rememberForCharacter,
} from '@/lib/chain/memory';
import { getStoreRecruitment } from './recruitments-store';

export interface SeedGenesisResult {
    ok: boolean;
    seeded: number;
    generated: number;
    skipped?: 'memory_unconfigured' | 'character_unreachable';
    error?: string;
}

export async function seedGenesisMemoryAction(
    characterId: string,
    // 不指定 → 交給 runner 依角色年齡推導(8–14;見 genesis-memory deriveGenesisCount)。
    // mint 流程(redeem-voucher)不帶 count,所以新角色自動拿到隨年齡的記憶數量。
    count?: number,
    // 私密內幕(candidate.secret)— 不上鏈、不另存,只在此餵給 genesis,讓它化成私密記憶。
    secret?: string,
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
        const [role, recruitment] = await Promise.all([
            resolveRole(characterId),
            resolveRecruitment(characterId),
        ]);
        // No roster passed → the genesis LLM skips relationshipMemories entirely
        // (relationships are the relationship-assess pass's job). Saves tokens too.
        const res = await runnerGenesis.runOnce({
            characterId,
            sagaId: d.sagaId,
            role: role ?? recruitment?.specialty,
            recruitmentRoleIntent: recruitment?.roleIntent,
            count,
            privateBackstory: secret,
        });
        if (res.skipReason) {
            return { ok: false, seeded: 0, generated: 0, skipped: res.skipReason };
        }

        let seeded = 0;
        for (const memory of res.selfMemories) {
            const wrote = await rememberForCharacter(characterId, memory, {
                kind: 'genesis',
                importance: 7,
            });
            if (wrote) seeded += 1;
        }
        return { ok: true, seeded, generated: res.selfMemories.length };
    } catch (err) {
        return {
            ok: false,
            seeded: 0,
            generated: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

async function resolveRecruitment(
    characterId: string,
): Promise<Awaited<ReturnType<typeof getStoreRecruitment>> | null> {
    const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
    if (!recruitmentId) return null;
    return getStoreRecruitment(recruitmentId);
}
