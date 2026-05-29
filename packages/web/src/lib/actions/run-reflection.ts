'use server';

/**
 * Server action — invoke runner reflection-trigger with admin keypair.
 *
 * Both active (owner's question) + passive (no question) modes route
 * through here. Admin keypair signs the chain anchor (storyteller cap-
 * gated). Off-chain owner gating is the caller's job (e.g. Composer
 * already shows the form only to verified owners via
 * InterventionComposerGate).
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { reflection as runnerReflection } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { rememberForCharacter } from '@/lib/chain/memory';

export interface RunReflectionInput {
    characterId: string;
    mode: 'active' | 'passive';
    /** Active mode only. Truncated server-side to 500 chars. */
    ownerQuestion?: string;
    dryRun?: boolean;
}

export interface RunReflectionResult {
    ok: boolean;
    reflection: string;
    anchored: boolean;
    skipReason?: string;
    reflectionId?: string;
    blobId?: string;
    digest?: string;
    error?: string;
}

export async function runReflectionAction(input: RunReflectionInput): Promise<RunReflectionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, reflection: '', anchored: false, error: 'saga 尚未種子化' };
    }
    if (input.mode === 'active' && !input.ownerQuestion?.trim()) {
        return {
            ok: false,
            reflection: '',
            anchored: false,
            error: 'active 模式必須提供問題',
        };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            reflection: '',
            anchored: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const res = await runnerReflection.runOnce({
            characterId: input.characterId,
            sagaId: d.sagaId,
            mode: input.mode,
            ownerQuestion: input.ownerQuestion?.trim().slice(0, 500),
            dryRun: input.dryRun,
            signer: input.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });
        // A reflection is the character's own private memory — write it
        // back to MemWal once anchored (no-op when memory unconfigured).
        if (res.anchored && res.reflection.trim()) {
            await rememberForCharacter(input.characterId, res.reflection);
        }

        return {
            ok: res.anchored || (input.dryRun === true && res.reflection.length > 0),
            reflection: res.reflection,
            anchored: res.anchored,
            skipReason: res.skipReason,
            reflectionId: res.reflectionId,
            blobId: res.blobId,
            digest: res.digest,
        };
    } catch (err) {
        return {
            ok: false,
            reflection: '',
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
