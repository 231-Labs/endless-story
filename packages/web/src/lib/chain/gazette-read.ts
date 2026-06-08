/**
 * Chain-side fetcher for saga gazettes.
 *
 * Gazettes are commitments whose `subject_id == sagaId` — that's how
 * we distinguish them from character POV chapters (whose subject_id =
 * characterId). The gazette compiler enforces this convention.
 *
 * BUT saga-subject is also used by DR-6 drama-beat commitments (a
 * machine-readable affect snapshot, content-type application/json). The
 * on-chain Commitment carries no `kind`, so those would otherwise surface
 * here and render as raw JSON in the gazette feed. We skip them by peeking at
 * the blob content (drama beats are `{"v":N,"kind":"drama-beat",...}`).
 *
 * Returns newest-first. Caller fetches the actual gazette markdown
 * via `/api/blob/{blobId}` (proxy) or directly from Walrus aggregator
 * (server-side).
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { blob as memwalBlob } from '@endless-story/memwal';
import { resolveNetwork } from './network.js';

/**
 * True if a blob is a non-gazette saga-subject commitment (a DR-6 drama beat).
 * Peeks at the content because the chain Commitment has no kind/content-type.
 * Fails open (false = treat as gazette) so a transient fetch error never hides
 * a real gazette.
 */
async function isNonGazetteBlob(blobId: string): Promise<boolean> {
    try {
        const r = await fetch(memwalBlob.getBlobUrl(blobId, 'testnet'));
        if (!r.ok) return false;
        const head = (await r.text()).slice(0, 240);
        return head.includes('"kind":"drama-beat"') || /^\s*\{\s*"v"\s*:\s*\d/.test(head);
    } catch {
        return false;
    }
}

export interface GazetteEntry {
    commitmentId: string;
    sagaId: string;
    blobId: string;
    /** Browser-friendly URL (charset-corrected proxy). */
    blobUrl: string;
    contentHashHex: string;
    committedAtMs: string;
}

export interface FetchGazettesOptions {
    /** Max entries returned (newest first). Default 10. */
    limit?: number;
}

export async function fetchGazettesForSaga(
    sagaId: string,
    opts: FetchGazettesOptions = {},
): Promise<GazetteEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 10;
    const client = makeSuiClient({ network: resolveNetwork() });

    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        summaries = await read.commitment.listCommitments(client, pkg, {
            sagaId,
            subjectId: sagaId, // distinguishes gazette from POV (subject = char)
            // over-fetch: drama beats share this subject and get filtered below,
            // so ask for more than `limit` to still return up to `limit` gazettes.
            maxEvents: limit + 12,
        });
    } catch (err) {
        console.warn('[gazette-read] listCommitments failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    const out: GazetteEntry[] = [];
    for (const s of summaries) {
        if (out.length >= limit) break;
        try {
            const res = await read.commitment.getCommitment(client, s.commitmentId);
            const json = res.json as unknown as {
                blob_id?: number[] | string;
                content_hash?: number[] | string;
            };
            const blobId = decodeByteString(json.blob_id);
            if (!blobId) continue;
            // Skip DR-6 drama beats (saga-subject, but JSON not prose).
            if (await isNonGazetteBlob(blobId)) continue;
            out.push({
                commitmentId: s.commitmentId,
                sagaId: s.sagaId,
                blobId,
                blobUrl: `/api/blob/${blobId}`,
                contentHashHex: decodeBytesHex(json.content_hash),
                committedAtMs: s.committedAtMs,
            });
        } catch {
            // skip unreadable
        }
    }
    return out;
}

/**
 * Fetch the latest gazette for the saga (1 result). Optimised for the
 * /feed teaser card which only needs the most recent.
 */
export async function fetchLatestGazetteForSaga(
    sagaId: string,
): Promise<GazetteEntry | null> {
    const list = await fetchGazettesForSaga(sagaId, { limit: 1 });
    return list[0] ?? null;
}

/* ── internals ──────────────────────────────────────────────── */

function decodeByteString(raw: number[] | string | undefined): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return new TextDecoder().decode(new Uint8Array(raw));
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
