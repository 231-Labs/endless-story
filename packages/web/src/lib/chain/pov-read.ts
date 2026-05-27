/**
 * Chain-side fetcher for character POV chapters.
 *
 * Reads `CommitmentCreated` events filtered by subject_id (character id)
 * and resolves each to its Walrus blob URL. Returns newest-first.
 *
 * For demo / dossier display we usually only need the latest 1–3 — the
 * `limit` option keeps the chain scan + Walrus fetches bounded.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

export interface PovChapterEntry {
    commitmentId: string;
    committedAtMs: string;
    /** Walrus blob id (we stored as bytes; need to decode back to string). */
    blobId: string;
    /** Walrus aggregator URL for direct fetch. */
    blobUrl: string;
    /** Hex content hash, for verification. */
    contentHashHex: string;
}

export interface FetchPovChaptersOptions {
    /** Max entries returned (newest first). Default 3. */
    limit?: number;
}

export async function fetchPovChaptersForCharacter(
    characterId: string,
    opts: FetchPovChaptersOptions = {},
): Promise<PovChapterEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 3;
    const client = makeSuiClient({ network: resolveNetwork() });

    // List CommitmentCreated events filtered by subjectId. Capped at
    // `limit` events; we fetch the Commitment object to decode blob_id
    // bytes back to string (events don't carry it).
    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        summaries = await read.commitment.listCommitments(client, pkg, {
            subjectId: characterId,
            maxEvents: limit,
        });
    } catch (err) {
        console.warn('[pov-read] listCommitments failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    const out: PovChapterEntry[] = [];
    for (const s of summaries) {
        try {
            const res = await read.commitment.getCommitment(client, s.commitmentId);
            const json = res.json as unknown as {
                blob_id?: number[] | string;
                content_hash?: number[] | string;
            };
            const blobId = decodeByteString(json.blob_id);
            const contentHashHex = decodeBytesHex(json.content_hash);
            if (!blobId) continue;
            out.push({
                commitmentId: s.commitmentId,
                committedAtMs: s.committedAtMs,
                blobId,
                blobUrl: buildWalrusBlobUrl(blobId),
                contentHashHex,
            });
        } catch {
            // Drop unreadable commitments silently — chain is source of truth,
            // but we don't want one bad blob to hide the rest.
        }
    }
    return out;
}

/**
 * Fetch the actual chapter text from Walrus.
 *
 * Note: this is intentionally a server-side fetch (no caching headers,
 * no fancy retry). Keep it simple — the aggregator already serves with
 * cache-control public + 24h max-age.
 */
export async function fetchChapterText(blobUrl: string): Promise<string> {
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`walrus aggregator HTTP ${res.status}`);
    return res.text();
}

/* ── internals ──────────────────────────────────────────────────── */

function decodeByteString(raw: number[] | string | undefined): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
        return new TextDecoder().decode(new Uint8Array(raw));
    }
    return '';
}

function decodeBytesHex(raw: number[] | string | undefined): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
        return raw.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return '';
}

function buildWalrusBlobUrl(blobId: string): string {
    // Walrus testnet aggregator — same default as memwal package.
    return `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
}
