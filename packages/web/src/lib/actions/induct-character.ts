'use server';

/**
 * Induct a character into the saga in ONE coordinated pass (Block 3).
 *
 * Replaces the old two-step mint tail (seed-genesis-memory + assess-relationships)
 * with a single induction:
 *   1. build the PUBLIC troupe snapshot (members + their existing ties + saga flavour)
 *   2. runner induction → { selfMemories, ties(prior/first_impression + dual memories) }
 *   3. write selfMemories into this character's private MemWal
 *   4. seed the symmetric public ties + dual memories (reuses assess's idempotent apply)
 *
 * `mode`:
 *   · 'newcomer' (default, used at mint) — stranger to existing cast unless the
 *     description names a prior tie.
 *   · 'founding' — creation-time cast that already know each other.
 *
 * `secret` (candidate.secret) feeds only the private self memories, never the ties.
 * Public-only snapshot in, so no one's private memories leak.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { induction as runnerInduction } from '@endless-story/runner';
import { resolveRole } from '@/lib/chain/pov-core';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import { isMemoryConfigured, rememberForCharacter } from '@/lib/chain/memory';
import { buildTroupeSnapshot } from '@/lib/chain/roster';
import { getStoreRecruitment } from './recruitments-store';
import { applyRelationshipTiesAction, type ProposedTie } from './assess-relationships';

export interface InductCharacterResult {
    ok: boolean;
    mode: 'founding' | 'newcomer';
    /** self memories written into MemWal. */
    selfSeeded: number;
    /** self memories the LLM generated (pre-write). */
    selfGenerated: number;
    /** fresh public ties seeded on chain. */
    tiesSeeded: number;
    /** relationship memories written (both sides). */
    tieMemoriesWritten: number;
    skipped?: 'character_unreachable' | 'memory_unconfigured';
    error?: string;
}

const EMPTY = {
    selfSeeded: 0,
    selfGenerated: 0,
    tiesSeeded: 0,
    tieMemoriesWritten: 0,
};

export async function inductCharacterAction(
    characterId: string,
    opts: { mode?: 'founding' | 'newcomer'; secret?: string; count?: number } = {},
): Promise<InductCharacterResult> {
    const mode = opts.mode ?? 'newcomer';
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) {
        return { ok: false, mode, ...EMPTY, error: 'saga 尚未種子化' };
    }

    // ── 1) public troupe snapshot (self excluded from roster) ──
    const snapshot = await buildTroupeSnapshot(d.sagaId).catch(() => null);
    const members = (snapshot?.members ?? []).filter((m) => m.id !== characterId);
    const nameById = new Map(members.map((m) => [m.id, m.name]));
    const roster: runnerInduction.GenesisRosterEntry[] = members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        gender: m.gender,
        ageYears: m.ageYears,
        brief: m.brief,
        currentSceneName: m.currentSceneName,
    }));
    const existingTies: runnerInduction.ExistingTieHint[] = (snapshot?.ties ?? [])
        .filter((t) => nameById.has(t.aId) && nameById.has(t.bId))
        .map((t) => ({ aName: nameById.get(t.aId)!, bName: nameById.get(t.bId)!, tone: t.tone }));

    const [role, recruitmentRoleIntent] = await Promise.all([
        resolveRole(characterId).catch(() => undefined),
        resolveRecruitmentIntent(characterId),
    ]);

    // ── 2) one induction pass ──
    let res: Awaited<ReturnType<typeof runnerInduction.runOnce>>;
    try {
        res = await runnerInduction.runOnce({
            characterId,
            sagaId: d.sagaId,
            mode,
            role: role ?? undefined,
            recruitmentRoleIntent,
            privateBackstory: opts.secret,
            roster,
            existingTies,
            saga: {
                premise: snapshot?.saga.premise,
                nature: snapshot?.saga.naturePrompt,
                rhythm: snapshot?.saga.rhythmHints,
            },
            count: opts.count,
        });
    } catch (err) {
        return { ok: false, mode, ...EMPTY, error: err instanceof Error ? err.message : String(err) };
    }
    if (res.skipReason) {
        return { ok: false, mode, ...EMPTY, skipped: res.skipReason };
    }

    // ── 3) self memories → private MemWal ──
    const memoryOn = isMemoryConfigured();
    let selfSeeded = 0;
    if (memoryOn) {
        for (const memory of res.selfMemories) {
            const wrote = await rememberForCharacter(characterId, memory, { kind: 'genesis', importance: 7 });
            if (wrote) selfSeeded += 1;
        }
    }

    // ── 4) symmetric public ties + dual memories (reuse assess apply; idempotent) ──
    const proposed: ProposedTie[] = res.ties.map((t) => ({
        otherId: t.otherId,
        otherName: t.otherName,
        tone: t.tone,
        kind: t.priorPast ? 'prior' : 'first_impression',
        selfMemory: t.selfMemory,
        otherMemory: t.otherMemory,
        importance: t.importance,
    }));
    const applied = proposed.length > 0 ? await applyRelationshipTiesAction(characterId, proposed).catch(() => null) : null;

    return {
        ok: true,
        mode,
        selfSeeded,
        selfGenerated: res.selfMemories.length,
        tiesSeeded: applied?.seeded ?? 0,
        tieMemoriesWritten: applied?.memoriesWritten ?? 0,
        skipped: memoryOn ? undefined : 'memory_unconfigured',
    };
}

async function resolveRecruitmentIntent(characterId: string): Promise<string | undefined> {
    try {
        const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
        if (!recruitmentId) return undefined;
        const rec = await getStoreRecruitment(recruitmentId);
        return rec?.roleIntent;
    } catch {
        return undefined;
    }
}
