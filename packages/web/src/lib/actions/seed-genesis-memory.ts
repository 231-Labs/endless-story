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
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
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
    seededSelf?: number;
    seededRelationships?: number;
    seededReciprocal?: number;
    skipped?: 'memory_unconfigured' | 'character_unreachable';
    error?: string;
}

export async function seedGenesisMemoryAction(
    characterId: string,
    count = 5,
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
        const [role, recruitment, fullRoster] = await Promise.all([
            resolveRole(characterId),
            resolveRecruitment(characterId),
            buildSagaRoster(d.sagaId).catch(() => [] as SagaRosterEntry[]),
        ]);
        const newEntry = fullRoster.find((r) => r.id === characterId);
        const existingRoster = fullRoster.filter((r) => r.id !== characterId);
        const res = await runnerGenesis.runOnce({
            characterId,
            sagaId: d.sagaId,
            role: role ?? recruitment?.specialty,
            recruitmentRoleIntent: recruitment?.roleIntent,
            roster: existingRoster,
            count,
        });
        if (res.skipReason) {
            return { ok: false, seeded: 0, generated: 0, skipped: res.skipReason };
        }

        let seededSelf = 0;
        let seededRelationships = 0;
        let seededReciprocal = 0;
        for (const memory of res.selfMemories) {
            const wrote = await rememberForCharacter(characterId, memory, {
                kind: 'genesis',
                importance: 7,
            });
            if (wrote) seededSelf += 1;
        }
        for (const rel of res.relationshipMemories) {
            const text = `對「${rel.otherName}」的初始印象：${rel.text}`;
            const wrote = await rememberForCharacter(characterId, text, {
                kind: 'relationship',
                importance: rel.importance,
            });
            if (wrote) seededRelationships += 1;
        }

        const reciprocalTargets = pickReciprocalTargets({
            newEntry,
            existingRoster,
            relationships: res.relationshipMemories,
            roleIntent: recruitment?.roleIntent,
        });
        for (const target of reciprocalTargets) {
            const wrote = await rememberForCharacter(target.id, reciprocalObservationText({
                newEntry,
                fallbackRole: role ?? recruitment?.specialty,
                target,
            }), {
                kind: 'observation',
                importance: 5,
            });
            if (wrote) seededReciprocal += 1;
        }

        const seeded = seededSelf + seededRelationships + seededReciprocal;
        return {
            ok: true,
            seeded,
            generated: res.selfMemories.length + res.relationshipMemories.length,
            seededSelf,
            seededRelationships,
            seededReciprocal,
        };
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

function pickReciprocalTargets(input: {
    newEntry?: SagaRosterEntry;
    existingRoster: SagaRosterEntry[];
    relationships: Array<{ otherId: string; otherName: string }>;
    roleIntent?: string;
}): SagaRosterEntry[] {
    const relationshipIds = new Set(input.relationships.map((r) => r.otherId));
    const scored = input.existingRoster
        .map((entry, index) => {
            let score = 0;
            if (relationshipIds.has(entry.id)) score += 8;
            if (
                input.newEntry?.currentSceneName &&
                entry.currentSceneName === input.newEntry.currentSceneName
            ) score += 5;
            if (input.roleIntent?.includes(entry.name)) score += 4;
            if (entry.role && input.roleIntent?.includes(entry.role)) score += 2;
            if (sameRoleFamily(input.newEntry?.role, entry.role)) score += 2;
            return { entry, score, index };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.slice(0, 3).map((x) => x.entry);
}

function reciprocalObservationText(input: {
    newEntry?: SagaRosterEntry;
    fallbackRole?: string;
    target: SagaRosterEntry;
}): string {
    const name = input.newEntry?.name ?? '新角色';
    const role = input.newEntry?.role && input.newEntry.role !== '—'
        ? input.newEntry.role
        : input.fallbackRole ?? '行當未明';
    const scene = input.newEntry?.currentSceneName
        ? `在${input.newEntry.currentSceneName}露了一面`
        : '入班後露了一面';
    const brief = input.newEntry?.brief ? `；${input.newEntry.brief.slice(0, 70)}` : '';
    return `新來的${role}「${name}」今日${scene}${brief}。我只記下眼前所見，尚不敢妄認交情深淺。`;
}

function sameRoleFamily(a?: string, b?: string): boolean {
    const fa = roleFamily(a);
    const fb = roleFamily(b);
    return Boolean(fa && fb && fa === fb);
}

function roleFamily(role?: string): string | null {
    if (!role || role === '—') return null;
    if (['花旦', '青衣', '武旦', '老旦'].some((r) => role.includes(r))) return 'dan';
    if (role.includes('小生')) return 'sheng';
    if (role.includes('丑')) return 'chou';
    if (role.includes('樂師')) return 'music';
    return role;
}
