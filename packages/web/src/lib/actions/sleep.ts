'use server';

/**
 * N2 — the character "sleeps": consolidate scattered memories into 1-2
 * dense reflections, store them back as anchored memories, and anchor one
 * on chain.
 *
 * This is the REFLECT step of the character loop (docs/NARRATIVE_AGENTS.md
 * §2). Without it, recall slowly degrades into a pile of low-density
 * observations + chapter fragments; with it, the character keeps
 * conclusions ("我終於明白我留下不是為了戲") instead of raw logs, and those
 * conclusions are what future decisions recall.
 *
 * Orchestration (mirrors character-turn / run-reflection):
 *   recall scattered (web/MemWal) → consolidate (runner LLM) →
 *   remember anchored (web/MemWal) → anchor on chain (runner + admin cap).
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { reflection as runnerReflection } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';
import { recallForConsolidation, rememberForCharacter } from '@/lib/chain/memory';

export interface RunSleepResult {
    ok: boolean;
    /** Number of scattered memories fed into consolidation. */
    scatteredCount?: number;
    /** The dense reflections produced (1-2). */
    reflections?: string[];
    /** Memories written back to MemWal (anchored). */
    remembered?: number;
    /** Chain anchor of the combined reflection. */
    anchored?: boolean;
    reflectionId?: string;
    blobId?: string;
    digest?: string;
    skipReason?: 'memory_unconfigured' | 'nothing_to_consolidate';
    error?: string;
}

/** Minimum scattered memories before sleep is worth running. */
const MIN_SCATTERED = 2;

export async function runSleepAction(
    characterId: string,
    opts?: { dryRun?: boolean },
): Promise<RunSleepResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin 載入失敗' };
    }

    const client = makeSuiClient({ network: resolveNetwork() });

    // Character + role + saga (for the consolidation prompt).
    const [charRes, sagaRes, role] = await Promise.all([
        read.character.getCharacter(client, characterId).catch(() => null),
        read.saga.getSaga(client, d.sagaId).catch(() => null),
        resolveRole(characterId).catch(() => null),
    ]);
    const name =
        (charRes?.json as unknown as { profile?: { name?: string } })?.profile?.name ?? '無名';
    const sagaName = (sagaRes?.json as unknown as { name?: string })?.name ?? '戲班';

    // 1. Recall the scattered raw material (observations + chapter fragments).
    const query = `${name} ${role ?? ''} ${sagaName} 近來經歷 心境 衝突 變化 放不下的事`;
    const scattered = await recallForConsolidation(characterId, query, 12);
    if (scattered.length === 0) {
        return { ok: false, skipReason: 'memory_unconfigured', scatteredCount: 0 };
    }
    if (scattered.length < MIN_SCATTERED) {
        return {
            ok: false,
            skipReason: 'nothing_to_consolidate',
            scatteredCount: scattered.length,
        };
    }

    // 2. Consolidate (runner LLM, 'primary' tier).
    let reflections: string[];
    try {
        const r = await runnerReflection.consolidateMemories({
            name,
            role: role ?? '—',
            sagaName,
            scattered: scattered.map((m) => m.text),
        });
        reflections = r.reflections;
    } catch (err) {
        return {
            ok: false,
            scatteredCount: scattered.length,
            error: 'consolidate 失敗:' + (err instanceof Error ? err.message : ''),
        };
    }
    if (reflections.length === 0) {
        return { ok: false, scatteredCount: scattered.length, skipReason: 'nothing_to_consolidate' };
    }

    if (opts?.dryRun) {
        return {
            ok: true,
            scatteredCount: scattered.length,
            reflections,
            remembered: 0,
            anchored: false,
        };
    }

    // 3. Remember each dense reflection back to MemWal — anchored so the
    //    next sleep won't re-compress it. Importance 8 (above chapters/obs).
    let remembered = 0;
    for (const text of reflections) {
        const ok = await rememberForCharacter(characterId, text, {
            kind: 'reflection',
            importance: 8,
            anchored: true,
        });
        if (ok) remembered += 1;
    }

    // 4. Anchor the consolidated reflection on chain (one Reflection object,
    //    combining the 1-2 lines). mode=passive, question='' (self-directed).
    const combined = reflections.join('\n\n');
    let anchorRes;
    try {
        anchorRes = await runnerReflection.anchorReflectionText({
            client,
            characterId,
            sagaId: d.sagaId,
            text: combined,
            mode: 'passive',
            question: '',
            importance: 8,
            signer: { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });
    } catch (err) {
        // MemWal writes already succeeded; chain anchor is best-effort.
        return {
            ok: remembered > 0,
            scatteredCount: scattered.length,
            reflections,
            remembered,
            anchored: false,
            error: 'anchor 失敗:' + (err instanceof Error ? err.message : ''),
        };
    }

    return {
        ok: true,
        scatteredCount: scattered.length,
        reflections,
        remembered,
        anchored: anchorRes.anchored,
        reflectionId: anchorRes.reflectionId,
        blobId: anchorRes.blobId,
        digest: anchorRes.digest,
    };
}
