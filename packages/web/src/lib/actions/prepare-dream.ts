'use server';

/**
 * Server action — moderate + upload dream to Walrus, return prepared
 * data for client-wallet to sign `dream::submit_dream` with.
 *
 * NO chain interaction here. User wallet builds + signs the tx
 * client-side. Server only owns the moderator LLM + Walrus credentials.
 */

import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
} from '@endless-story/sdk';
import { dream as runnerDream } from '@endless-story/runner';
import { resolveNetwork } from '@/lib/chain/network';

export interface PrepareDreamActionInput {
    characterId: string;
    rawText: string;
}

export interface PrepareDreamActionResult {
    ok: boolean;
    status?: 'accepted' | 'rejected';
    /** Walrus blob ref + hash bytes (when accepted). */
    blobId?: string;
    contentHashBytes?: number[];
    optimizedText?: string;
    importance?: number;
    /** Why rejected. */
    rejectReason?: string;
    /** General action-level error (LLM down, walrus down). */
    error?: string;
}

export async function prepareDreamAction(
    input: PrepareDreamActionInput,
): Promise<PrepareDreamActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.packageId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }
    if (!input.rawText.trim()) {
        return { ok: false, error: '夢境文字不可為空' };
    }

    // Pull character + saga name for moderator voice context.
    const client = makeSuiClient({ network: resolveNetwork() });
    let characterName = '某人';
    let sagaName = '春雪社';
    try {
        const [charRes, sagaRes] = await Promise.all([
            read.character.getCharacter(client, input.characterId),
            read.saga.getSaga(client, d.sagaId),
        ]);
        const charJson = charRes.json as { profile?: { name?: string } } | undefined;
        const sagaJson = sagaRes.json as { name?: string } | undefined;
        characterName = charJson?.profile?.name ?? characterName;
        sagaName = sagaJson?.name ?? sagaName;
    } catch {
        // Tolerate — moderator still works with defaults.
    }

    try {
        const res = await runnerDream.prepareDream({
            rawText: input.rawText,
            characterName,
            sagaName,
            eraHint: '民初上海戲園',
        });
        if (res.status === 'rejected') {
            return { ok: false, status: 'rejected', rejectReason: res.rejectReason };
        }
        const p = res.prepared;
        return {
            ok: true,
            status: 'accepted',
            blobId: p.blobId,
            // Hash as bytes (number[]) so client can pass to PTB directly.
            contentHashBytes: hexToBytes(p.contentHashHex),
            optimizedText: p.optimizedText,
            importance: p.importance,
        };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

function hexToBytes(hex: string): number[] {
    const clean = hex.replace(/^0x/, '');
    const out: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
        out.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return out;
}
