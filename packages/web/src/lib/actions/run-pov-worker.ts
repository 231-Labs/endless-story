'use server';

/**
 * Server action — invoke runner character-worker with admin keypair.
 *
 * Admin-only entry (gated upstream in the page / button). Bypasses
 * subscriber gate via `forceRun`. Returns chapter prose + commitment
 * ref so the UI can render + link to chain.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { characterWorker as runnerCharacterWorker } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import { getStoreRecruitment } from '@/lib/actions/recruitments-store';

export interface RunPovInput {
    characterId: string;
    /** Override the trigger narrative — when empty, server falls back to
     *  "你剛剛在 saga 中經歷了一段時光，請寫下你此刻的心境。" */
    triggerNarrative?: string;
    forceRun?: boolean;
    dryRun?: boolean;
}

export interface RunPovResult {
    ok: boolean;
    chapter: string;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    blobId?: string;
    blobUrl?: string;
    digest?: string;
    /** Owner dream weaved into this chapter, if any. */
    dreamFragmentUsed?: string;
    error?: string;
}

export async function runPovAction(input: RunPovInput): Promise<RunPovResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return {
            ok: false,
            chapter: '',
            anchored: false,
            error: 'saga 尚未種子化',
        };
    }

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
        '你剛剛在 saga 中經歷了一段時光，請寫下你此刻的心境。';

    // Resolve role from voucher hint → off-chain Recruitment.specialty.
    // Chain Character has no role field; this is what makes the LLM
    // address "富商" instead of the placeholder default.
    const recruitmentId = await fetchRecruitmentIdForCharacter(input.characterId);
    const recruitment = recruitmentId ? await getStoreRecruitment(recruitmentId) : null;
    const role = recruitment?.specialty ?? undefined;

    try {
        const res = await runnerCharacterWorker.runOnce({
            characterId: input.characterId,
            sagaId: d.sagaId,
            triggerNarrative,
            role,
            forceRun: input.forceRun ?? true, // admin trigger always bypasses
            dryRun: input.dryRun,
            signer: input.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });
        return {
            ok: res.anchored || (input.dryRun === true && res.chapter.length > 0),
            chapter: res.chapter,
            anchored: res.anchored,
            skipReason: res.skipReason,
            commitmentId: res.commitmentId,
            blobId: res.blobId,
            blobUrl: res.blobUrl,
            digest: res.digest,
            dreamFragmentUsed: res.dreamFragmentUsed,
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
