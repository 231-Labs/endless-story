/**
 * Shared per-character POV generation core.
 *
 * Server-only (imports runner + admin keypair). NOT a 'use server'
 * module — it's a plain helper that server actions (run-pov-worker,
 * daily-batch) call. Never import from a client component.
 *
 * Encapsulates the bits both the single-character admin trigger and the
 * daily batch need: role resolution (voucher → off-chain specialty),
 * the runner character-worker call, and result mapping. Phase 3 will
 * also thread MemWal recall snippets through here.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { characterWorker as runnerCharacterWorker } from '@endless-story/runner';
import type { AdminContext } from '@/lib/chain/admin-signer';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import { getStoreRecruitment } from '@/lib/actions/recruitments-store';
import { recallForCharacter, rememberForCharacter } from '@/lib/chain/memory';

export interface PovCoreOptions {
    triggerNarrative: string;
    forceRun?: boolean;
    dryRun?: boolean;
    /** Phase 3: MemWal recall snippets to weave into the prompt. */
    recentMemorySnippets?: string[];
}

export interface PovCoreResult {
    ok: boolean;
    chapter: string;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    digest?: string;
    dreamFragmentUsed?: string;
    error?: string;
    /** How many MemWal memories were recalled into the prompt (0 when
     *  memory not configured). */
    recalledCount?: number;
    /** Whether the new chapter was written back to MemWal. */
    remembered?: boolean;
}

/**
 * Resolve a character's role from voucher hint → off-chain
 * Recruitment.specialty. Chain Character has no role field; this is what
 * makes the LLM address「富商」instead of a placeholder.
 */
export async function resolveRole(characterId: string): Promise<string | undefined> {
    try {
        const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
        if (!recruitmentId) return undefined;
        const recruitment = await getStoreRecruitment(recruitmentId);
        return recruitment?.specialty ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * Generate (and optionally anchor) one character's POV chapter.
 * `admin` is the loaded keypair context; caller loads it once and reuses
 * across a batch.
 */
export async function runPovForCharacter(
    admin: AdminContext,
    characterId: string,
    opts: PovCoreOptions,
): Promise<PovCoreResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, chapter: '', anchored: false, error: 'saga 尚未種子化' };
    }

    const role = await resolveRole(characterId);

    // Recall long-term memory (MemWal) for prompt context. The trigger
    // narrative doubles as the semantic query. No-op ([]) when memory
    // isn't configured. Merge with any caller-supplied snippets.
    const recalled = await recallForCharacter(characterId, opts.triggerNarrative, 6);
    const recentMemorySnippets = [
        ...(opts.recentMemorySnippets ?? []),
        ...recalled,
    ];

    try {
        const res = await runnerCharacterWorker.runOnce({
            characterId,
            sagaId: d.sagaId,
            triggerNarrative: opts.triggerNarrative,
            role,
            recentMemorySnippets:
                recentMemorySnippets.length > 0 ? recentMemorySnippets : undefined,
            forceRun: opts.forceRun ?? true,
            dryRun: opts.dryRun,
            signer: opts.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });

        // Write the new chapter back into the character's memory — but
        // only once it's actually anchored on chain (don't pollute memory
        // on dry-runs or failed anchors).
        let remembered = false;
        if (res.anchored && res.chapter.trim()) {
            remembered = await rememberForCharacter(characterId, res.chapter);
        }

        return {
            ok: res.anchored || (opts.dryRun === true && res.chapter.length > 0),
            chapter: res.chapter,
            anchored: res.anchored,
            skipReason: res.skipReason,
            commitmentId: res.commitmentId,
            blobId: res.blobId,
            blobUrl: res.blobUrl,
            digest: res.digest,
            dreamFragmentUsed: res.dreamFragmentUsed,
            recalledCount: recalled.length,
            remembered,
        };
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
