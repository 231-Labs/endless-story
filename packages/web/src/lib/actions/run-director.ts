'use server';

/**
 * Server action — invoke runner saga-director with admin keypair.
 *
 * The director run is **expensive** (LLM call + potentially several
 * chain calls), so we keep this server-side and gate behind the admin
 * route. Returns a plain-data envelope (no transaction in flight) that
 * the client UI can render.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { director as runnerDirector } from '@endless-story/runner';
import { getAdminContext } from '@/lib/chain/admin-signer';

export interface RunDirectorActionInput {
    intent: string;
    dryRun: boolean;
}

export interface RunDirectorActionResult {
    ok: boolean;
    /** Validated capabilities the LLM picked. */
    capabilities: Array<Record<string, unknown>>;
    /** LLM's stated rationale (short). */
    rationale: string;
    /** Chain tx digest if dispatched. */
    digest?: string;
    /** Validation / dispatch errors, if any. */
    errors?: string[];
    /** Raw LLM text, useful for debugging incoherent outputs. */
    llmResponseRaw: string;
    /** Saga snapshot the LLM saw (for reproducing). */
    snapshot?: unknown;
    /** Failure message if the action itself errored. */
    error?: string;
}

export async function runDirectorAction(
    input: RunDirectorActionInput,
): Promise<RunDirectorActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return {
            ok: false,
            capabilities: [],
            rationale: '',
            llmResponseRaw: '',
            error: 'saga 尚未種子化 — 缺 sagaId / storytellerCapId',
        };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            capabilities: [],
            rationale: '',
            llmResponseRaw: '',
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const res = await runnerDirector.runOnce({
            sagaId: d.sagaId,
            intent: input.intent,
            dryRun: input.dryRun,
            signer: input.dryRun
                ? undefined
                : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
        });
        return {
            ok: res.dispatched || (input.dryRun && res.capabilities.length > 0),
            capabilities: res.capabilities as unknown as Array<Record<string, unknown>>,
            rationale: res.rationale,
            digest: res.digest,
            errors: res.errors,
            llmResponseRaw: res.llmResponseRaw,
            snapshot: res.snapshot,
        };
    } catch (err) {
        return {
            ok: false,
            capabilities: [],
            rationale: '',
            llmResponseRaw: '',
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
