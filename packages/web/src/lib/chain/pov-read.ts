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
import { blob as memwalBlob } from '@endless-story/memwal';
import { resolveNetwork } from './network.js';

export interface PovChapterEntry {
    commitmentId: string;
    sagaId: string;
    subjectId: string;
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

export interface FetchSagaPovChaptersOptions extends FetchPovChaptersOptions {
    /**
     * Valid POV subjects for this saga. Passing this lets callers exclude
     * other commitment-road docs (persona JSON, gazette, drama beat) without
     * needing a content-type field on-chain.
     */
    characterIds?: string[];
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
                sagaId: s.sagaId,
                subjectId: s.subjectId,
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

export async function fetchPovChaptersForSaga(
    sagaId: string,
    opts: FetchSagaPovChaptersOptions = {},
): Promise<PovChapterEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 20;
    const characterIds = opts.characterIds ? new Set(opts.characterIds) : null;
    const client = makeSuiClient({ network: resolveNetwork() });

    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        summaries = await read.commitment.listCommitments(client, pkg, {
            sagaId,
            // Over-fetch because saga-subject gazettes and derived persona
            // subjects share the same commitment event stream.
            maxEvents: Math.max(limit * 4, limit + 24),
        });
    } catch (err) {
        console.warn('[pov-read] list saga commitments failed:', err);
        return [];
    }

    const out: PovChapterEntry[] = [];
    for (const s of summaries) {
        if (out.length >= limit) break;
        if (s.subjectId === sagaId) continue;
        if (characterIds && !characterIds.has(s.subjectId)) continue;
        try {
            const res = await read.commitment.getCommitment(client, s.commitmentId);
            const json = res.json as unknown as {
                blob_id?: number[] | string;
                content_hash?: number[] | string;
            };
            const blobId = decodeByteString(json.blob_id);
            if (!blobId) continue;
            out.push({
                commitmentId: s.commitmentId,
                sagaId: s.sagaId,
                subjectId: s.subjectId,
                committedAtMs: s.committedAtMs,
                blobId,
                blobUrl: buildWalrusBlobUrl(blobId),
                contentHashHex: decodeBytesHex(json.content_hash),
            });
        } catch {
            // Skip unreadable commitments; the rest of the feed can still render.
        }
    }
    return out;
}

export async function fetchPovChapterByCommitment(
    commitmentId: string,
): Promise<PovChapterEntry | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const res = await read.commitment.getCommitment(client, commitmentId);
        const json = res.json as unknown as {
            saga_id?: string;
            subject_id?: string;
            committed_at_ms?: string | number;
            blob_id?: number[] | string;
            content_hash?: number[] | string;
        };
        const blobId = decodeByteString(json.blob_id);
        if (!blobId) return null;
        return {
            commitmentId,
            sagaId: json.saga_id ?? ENDLESS_STORY_DEPLOYMENT.sagaId,
            subjectId: json.subject_id ?? '',
            committedAtMs: String(json.committed_at_ms ?? '0'),
            blobId,
            blobUrl: buildWalrusBlobUrl(blobId),
            contentHashHex: decodeBytesHex(json.content_hash),
        };
    } catch {
        return null;
    }
}

/**
 * Fetch the actual chapter text from Walrus.
 *
 * Note: this is intentionally a server-side fetch (no caching headers,
 * no fancy retry). Keep it simple — the aggregator already serves with
 * cache-control public + 24h max-age.
 */
export async function fetchChapterText(blobUrl: string): Promise<string> {
    const res = await fetch(resolveServerFetchUrl(blobUrl));
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
    // Web proxy route — re-emits the Walrus aggregator response with a
    // proper UTF-8 content-type header so browsers render text blobs
    // (chapters, gazettes) instead of mojibake. Direct aggregator URL:
    //   https://aggregator.walrus-testnet.walrus.space/v1/blobs/{id}
    // returns the same bytes but with no Content-Type (browsers fall
    // through to octet-stream → 中文亂碼). See /api/blob route handler.
    return `/api/blob/${blobId}`;
}

function resolveServerFetchUrl(blobUrl: string): string {
    const match = blobUrl.match(/^\/api\/blob\/([^/?#]+)/);
    if (!match) return blobUrl;
    return memwalBlob.getBlobUrl(decodeURIComponent(match[1]), 'testnet');
}
