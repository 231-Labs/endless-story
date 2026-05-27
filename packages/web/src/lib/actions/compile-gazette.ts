'use server';

/**
 * Server action — invoke runner gazette compiler with admin keypair.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { gazette as runnerGazette } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';

export interface CompileGazetteActionInput {
    day?: number;
    dryRun?: boolean;
}

export interface CompileGazetteActionResult {
    ok: boolean;
    markdown: string;
    eventCount: number;
    chapterCount: number;
    anchored: boolean;
    skipReason?: string;
    commitmentId?: string;
    blobId?: string;
    digest?: string;
    error?: string;
}

export async function compileGazetteAction(
    input: CompileGazetteActionInput,
): Promise<CompileGazetteActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return {
            ok: false,
            markdown: '',
            eventCount: 0,
            chapterCount: 0,
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
            markdown: '',
            eventCount: 0,
            chapterCount: 0,
            anchored: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const res = await runnerGazette.runOnce({
            sagaId: d.sagaId,
            day: input.day,
            dryRun: input.dryRun,
            signer: input.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });
        return {
            ok: res.anchored || (input.dryRun === true && res.markdown.length > 0),
            markdown: res.markdown,
            eventCount: res.eventCount,
            chapterCount: res.chapterCount,
            anchored: res.anchored,
            skipReason: res.skipReason,
            commitmentId: res.commitmentId,
            blobId: res.blobId,
            digest: res.digest,
        };
    } catch (err) {
        return {
            ok: false,
            markdown: '',
            eventCount: 0,
            chapterCount: 0,
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
