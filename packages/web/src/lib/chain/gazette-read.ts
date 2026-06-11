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
 * Perf: this used to be the slowest piece of /feed — a commitment scan plus a
 * SEQUENTIAL, UNCACHED blob fetch per candidate on every load. Now the
 * commitment JSON caches hard (write-once object), the blob peek goes through
 * the immutable-blob text cache (shared with the gazette body render), the
 * candidates resolve in parallel, and the assembled list is short-TTL cached
 * with stale-while-revalidate so a TTL rollover never blocks the page.
 *
 * Returns newest-first. Caller fetches the actual gazette markdown
 * via `/api/blob/{blobId}` (proxy) or the shared cached text fetch.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { fetchChapterText } from './pov-read.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';

/** Stale window for list assemblies — serve seconds-old feeds instantly. */
const LIST_STALE_MS = 10 * 60 * 1000;

/**
 * True if a blob is a non-gazette saga-subject commitment (a DR-6 drama beat).
 * Peeks at the content because the chain Commitment has no kind/content-type.
 * Fails open (false = treat as gazette) so a transient fetch error never hides
 * a real gazette. The peek shares the immutable-blob cache with the body
 * render, so the gazette list pays for each blob at most once per process.
 */
async function isNonGazetteBlob(blobId: string): Promise<boolean> {
    try {
        const head = (await fetchChapterText(`/api/blob/${blobId}`)).slice(0, 240);
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
    return cachedPublicRead(
        `gazettes:saga:${sagaId}:${limit}`,
        publicChainReadTtl(30_000),
        () => fetchGazettesForSagaUncached(sagaId, limit),
        { staleTtlMs: LIST_STALE_MS },
    );
}

async function fetchGazettesForSagaUncached(
    sagaId: string,
    limit: number,
): Promise<GazetteEntry[]> {
    const client = makeSuiClient({ network: resolveNetwork() });

    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        summaries = await read.commitment.listCommitments(client, ENDLESS_STORY_DEPLOYMENT.packageId, {
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

    // Resolve every candidate in parallel (commitment JSON + blob peek are both
    // cached), keep order (newest-first), drop drama beats / unreadables.
    const resolved = await Promise.all(
        summaries.map(async (s): Promise<GazetteEntry | null> => {
            try {
                const json = await getCommitmentCached(client, s.commitmentId);
                const blobId = decodeByteString(json.blob_id);
                if (!blobId) return null;
                // Skip DR-6 drama beats (saga-subject, but JSON not prose).
                if (await isNonGazetteBlob(blobId)) return null;
                return {
                    commitmentId: s.commitmentId,
                    sagaId: s.sagaId,
                    blobId,
                    blobUrl: `/api/blob/${blobId}`,
                    contentHashHex: decodeBytesHex(json.content_hash),
                    committedAtMs: s.committedAtMs,
                };
            } catch {
                return null; // skip unreadable
            }
        }),
    );
    return resolved.filter((g): g is GazetteEntry => g != null).slice(0, limit);
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

interface CommitmentJson {
    blob_id?: number[] | string;
    content_hash?: number[] | string;
}

/** Commitment objects are write-once → cache the decoded JSON hard. */
function getCommitmentCached(
    client: ReturnType<typeof makeSuiClient>,
    commitmentId: string,
): Promise<CommitmentJson> {
    return cachedPublicRead(
        `gazette:commitment:${commitmentId}`,
        publicChainReadTtl(60 * 60 * 1000),
        async () => {
            const res = await read.commitment.getCommitment(client, commitmentId);
            return res.json as unknown as CommitmentJson;
        },
    );
}

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
