'use server';

/**
 * Director-authored scarcity — the Showrunner agent's `register_resource` tool.
 *
 * Lets the agent (heartbeat / admin chat) DELIBERATELY open a brand-new contested
 * stake on-chain when the story is circling the same few resources. Unlike the
 * tick-loop's auto-cadence (a cheap LLM consulted every 6 calls), this is a direct
 * directorial mandate: the agent already decided the kind+display, so we skip the
 * cooldown + decision LLM and just enforce the rails (director cap + validation)
 * and instantiate. Same conservation guarantees as the auto path.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { fetchSagaRosterSnapshot } from '@/lib/director/character-inspect';
import { saveResourceIntent } from '@/lib/chain/resource-intents';
import { registerResourceDirect, type ProposeResourceResult } from './propose-resources';

export interface RegisterResourceActionInput {
    /** ascii lowercase slug — the contention axis (e.g. feud / patron / scandal). */
    kind: string;
    /** human resource name (≤24 chars) — the half readers see. */
    display: string;
    /** scarce capacity, default 1 (clamped to castSize-1 so it stays contested). */
    capacity?: number;
    /**
     * Optional 行當 this stake is FOR — those roles ache for it, others stand down.
     * Without it a fresh kind gets a flat 0.5 want from everyone (a broad scramble);
     * with it the stake is character-shaped. Matched like ROLE_AMBITION (substring).
     */
    wantedBy?: string[];
    /** Validate only, don't instantiate on chain. */
    dryRun?: boolean;
}

export async function registerResourceAction(
    input: RegisterResourceActionInput,
): Promise<ProposeResourceResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) return { ok: false, reason: 'saga 尚未種子化' };

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
    }

    const client = makeSuiClient({ network: resolveNetwork() });
    // castSize only clamps capacity (to castSize-1, so the slot stays contested).
    // If the roster read fails (0), the clamp falls to capacity 1 — conservative
    // (more scarce, never less), and capacity-1 is the default anyway — so a
    // transient roster miss can't produce an uncontested slot.
    const roster = await fetchSagaRosterSnapshot().catch(() => null);
    const castSize = roster?.members.length ?? 0;

    const result = await registerResourceDirect({
        sagaId: d.sagaId,
        capId: d.storytellerCapId,
        signer: admin.signer,
        client,
        kind: input.kind,
        display: input.display,
        capacity: input.capacity,
        castSize,
        dryRun: input.dryRun,
    });

    // Persist who the stake is FOR — only on a real (non-dry) success, keyed by the
    // on-chain label the validator built. The drama derivation reads this so the
    // named 行當 ache for it and others stand down (vs a flat 0.5 scramble).
    if (result.ok && !input.dryRun && result.created?.label && Array.isArray(input.wantedBy)) {
        saveResourceIntent(result.created.label, input.wantedBy);
    }

    return result;
}
