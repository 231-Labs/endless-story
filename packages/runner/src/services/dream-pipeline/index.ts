/**
 * Dream Pipeline — owner-paid memory injection.
 *
 * Flow split into two halves:
 *
 * **Server-side (this module)**: moderate raw text + upload optimised
 * blob to Walrus. Returns the prepared `{ blobId, contentHash,
 * optimizedText, importance }`. NO chain interaction — payment + dream
 * object creation happens on the client side where the user's wallet
 * signs the tx with their own ENDLESS Coin.
 *
 * **Client-side (web wallet)**: build PTB calling `dream::submit_dream`
 * with the prepared blob/hash + payment Coin + OwnerCap. User signs.
 *
 * Why split: dream submission burns user ENDLESS, so the user MUST sign
 * — server can't sign on their behalf without breaking the payment
 * provenance. Moderation needs server-side LLM access (api keys) so
 * can't run client-side either.
 */

import { createHash } from 'node:crypto';
import { blob as memwalBlob } from '@endless-story/memwal';
import { moderateDream, type ModerateDreamResult } from './moderator.js';

export {
    buildDreamModeratorSystemPrompt,
    buildDreamModeratorUserPrompt,
    type ModerateDreamInput,
    type ModerateDreamResult,
} from './moderator.js';

export interface PrepareDreamInput {
    rawText: string;
    /** Character context for the moderator prompt voice. */
    characterName: string;
    sagaName: string;
    eraHint?: string;
    model?: string;
}

export interface PreparedDream {
    /** Walrus blob id of the optimised dream fragment. */
    blobId: string;
    /** Walrus aggregator URL (informational). */
    blobUrl: string;
    /** Hex SHA-256 over the bytes uploaded. */
    contentHashHex: string;
    /** Same bytes as Uint8Array — caller may want to display the
     *  optimised text + use the bytes when constructing the tx. */
    contentBytes: Uint8Array;
    /** Moderator-rewritten dream fragment (UTF-8 text). */
    optimizedText: string;
    /** 0-10 importance assigned by moderator. */
    importance: number;
}

export type PrepareDreamResult =
    | { status: 'accepted'; prepared: PreparedDream }
    | { status: 'rejected'; rejectReason: string };

/**
 * Server-side preparation. Returns either prepared data the client
 * can use to build a `submit_dream` tx, or a rejection reason.
 */
export async function prepareDream(input: PrepareDreamInput): Promise<PrepareDreamResult> {
    const mod = await moderateDream(input);
    if (mod.status === 'rejected') {
        return { status: 'rejected', rejectReason: mod.rejectReason ?? '未通過審核' };
    }
    const optimized = mod.optimizedText!;
    const importance = mod.importance ?? 8;
    const bytes = new TextEncoder().encode(optimized);

    // Hash before upload — content-addressed but we also want SHA-256
    // since that's what commitment.move stores conceptually.
    const hash = sha256(bytes);
    const contentHashHex = bytesToHex(hash);

    // Upload to Walrus testnet (same default as POV chapter pipeline).
    let put;
    try {
        put = await memwalBlob.putBlob(bytes, {
            network: 'testnet',
            epochs: 5,
            contentType: 'text/plain; charset=utf-8',
        });
    } catch (err) {
        return {
            status: 'rejected',
            rejectReason: `Walrus 上傳失敗：${err instanceof Error ? err.message : String(err)}`,
        };
    }

    return {
        status: 'accepted',
        prepared: {
            blobId: put.blobId,
            blobUrl: put.url,
            contentHashHex,
            contentBytes: bytes,
            optimizedText: optimized,
            importance,
        },
    };
}

/**
 * Convenience: pure moderation (no Walrus upload). Used by an admin
 * preview UI to test moderator output without committing.
 */
export async function moderateOnly(input: PrepareDreamInput): Promise<ModerateDreamResult> {
    return moderateDream(input);
}

/* ── helpers ─────────────────────────────────────────────── */

function sha256(bytes: Uint8Array): Uint8Array {
    const h = createHash('sha256');
    h.update(bytes);
    return new Uint8Array(h.digest());
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
