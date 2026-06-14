'use server';

/**
 * Server action — invoke the runner event-chapter compiler with the admin
 * keypair. Weaves every POV of one on-chain event into the canonical "回"
 * (event_cut) and anchors it (subject = sceneId). See docs/CONTENT_PIPELINE §2.
 *
 * Two call shapes:
 *   - tick loop: pass `povs` directly (freshly-anchored prose — no index-lag
 *     re-fetch).
 *   - standalone / admin: pass `castCharacterIds` + `eventTx` and let the
 *     compiler fetch each matching POV from chain.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { eventChapter as runnerEventChapter } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';

type EventCutPov = runnerEventChapter.EventCutPov;

export interface CompileEventChapterActionInput {
    sceneId: string;
    sceneName?: string;
    eventTx?: string;
    eventLabel?: string;
    day?: number;
    /** POVs to weave (tick-loop path). */
    povs?: EventCutPov[];
    /** Cast to fetch POVs for (standalone path). */
    castCharacterIds?: string[];
    /** Saga peers with gender, for the self-check's pronoun rules on the woven cut. */
    rosterPeople?: Array<{ name: string; gender: string; role?: string }>;
    dryRun?: boolean;
}

export interface CompileEventChapterActionResult {
    ok: boolean;
    chapter: string;
    povCount: number;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    blobId?: string;
    digest?: string;
    error?: string;
}

export async function compileEventChapterAction(
    input: CompileEventChapterActionInput,
): Promise<CompileEventChapterActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, chapter: '', povCount: 0, anchored: false, error: 'saga 尚未種子化' };
    }
    if (!input.sceneId) {
        return { ok: false, chapter: '', povCount: 0, anchored: false, error: 'sceneId 缺失' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            povCount: 0,
            anchored: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const res = await runnerEventChapter.runOnce({
            sagaId: d.sagaId,
            sceneId: input.sceneId,
            sceneName: input.sceneName,
            eventTx: input.eventTx,
            eventLabel: input.eventLabel,
            day: input.day,
            povs: input.povs,
            castCharacterIds: input.castCharacterIds,
            rosterPeople: input.rosterPeople,
            dryRun: input.dryRun,
            signer: input.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });
        return {
            ok: res.anchored || (input.dryRun === true && res.chapter.length > 0),
            chapter: res.chapter,
            povCount: res.povCount,
            anchored: res.anchored,
            skipReason: res.skipReason,
            commitmentId: res.commitmentId,
            blobId: res.blobId,
            digest: res.digest,
        };
    } catch (err) {
        return {
            ok: false,
            chapter: '',
            povCount: 0,
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
