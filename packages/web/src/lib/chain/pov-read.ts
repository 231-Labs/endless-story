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
import { normalizeWalrusBlobId } from '@endless-story/shared';
import { blob as memwalBlob } from '@endless-story/memwal';
import { resolveNetwork } from './network.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';
import { parseProvenance } from './chapter-provenance.js';
import { decodeBytesHex } from './decode.js';

/**
 * Walrus blobs are immutable + content-addressed (the id IS the content hash),
 * so a chapter body never changes once written. Cache the fetched text hard:
 * this is what stops the chapter page from re-reading up to 40 bodies from the
 * aggregator on every navigation (the cause of the multi-second blank load that
 * also delayed wallet auto-connect). Honors CHAIN_READ_CACHE_TTL_MS=0 to disable.
 */
const BLOB_TEXT_TTL_MS = 6 * 60 * 60 * 1000;

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
    /**
     * First-paragraph plaintext preview (provenance + markdown stripped),
     * server-extracted so a non-subscriber's HTML carries ONLY this teaser —
     * never the full chapter body. Absent when not requested or unreadable.
     * The gate is a UX gate (the blob is plaintext on Walrus anyway), so a
     * first-paragraph teaser is acceptable; we still avoid shipping full text.
     */
    teaser?: string;
}

export interface FetchPovChaptersOptions {
    /** Max entries returned (newest first). Default 3. */
    limit?: number;
    /**
     * Server-extract a first-paragraph `teaser` for each entry (one cached
     * Walrus read per chapter). Lets a locked dossier card show an opening
     * preview without shipping the full body to non-subscribers.
     */
    withTeaser?: boolean;
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

    // Each entry resolves independently (commitment object + optional teaser
    // blob) — resolve them concurrently instead of one 2-read chain at a time.
    const entries = await Promise.all(
        summaries.map(async (s): Promise<PovChapterEntry | null> => {
            try {
                const res = await read.commitment.getCommitment(client, s.commitmentId);
                const json = res.json as unknown as {
                    blob_id?: number[] | string;
                    content_hash?: number[] | string;
                };
                const blobId = normalizeWalrusBlobId(json.blob_id);
                if (!blobId) return null;
                const blobUrl = buildWalrusBlobUrl(blobId);
                return {
                    commitmentId: s.commitmentId,
                    sagaId: s.sagaId,
                    subjectId: s.subjectId,
                    committedAtMs: s.committedAtMs,
                    blobId,
                    blobUrl,
                    contentHashHex: decodeBytesHex(json.content_hash),
                    ...(opts.withTeaser
                        ? { teaser: await extractTeaser(blobUrl) }
                        : {}),
                };
            } catch {
                // Drop unreadable commitments silently — chain is source of truth,
                // but we don't want one bad blob to hide the rest.
                return null;
            }
        }),
    );
    return entries.filter((e): e is PovChapterEntry => e !== null);
}

/**
 * Read a chapter blob server-side and return only its first non-empty
 * paragraph as plain text (provenance header + light markdown stripped).
 * Used for the locked-card teaser so the full body never reaches a
 * non-subscriber. Uses the hard immutable-blob cache, so repeat dossier
 * visits don't re-fetch. Returns undefined on any read failure.
 */
async function extractTeaser(blobUrl: string): Promise<string | undefined> {
    try {
        const raw = await fetchChapterText(blobUrl);
        return firstParagraphPlainText(raw);
    } catch {
        return undefined;
    }
}

/** First non-empty paragraph → plain text, capped to ~1–2 sentences. */
export function firstParagraphPlainText(raw: string): string | undefined {
    const { body } = parseProvenance(raw.trim());
    const para = body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        // Skip leading markdown headings / hr so the teaser is real prose.
        .find((p) => p && !/^#{1,6}\s/.test(p) && !/^-{3,}$/.test(p));
    if (!para) return undefined;
    const flat = para
        .replace(/^#{1,6}\s+/, '')
        .replace(/[*_`>]/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    if (!flat) return undefined;
    // Keep it to an opening taste: cap at ~120 chars on a sentence boundary.
    if (flat.length <= 120) return flat;
    const slice = flat.slice(0, 120);
    const lastStop = Math.max(
        slice.lastIndexOf('。'),
        slice.lastIndexOf('！'),
        slice.lastIndexOf('？'),
    );
    return (lastStop > 40 ? slice.slice(0, lastStop + 1) : slice) + '…';
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

    // Filter to POV candidates first, then resolve concurrently. A small
    // over-fetch (+8) absorbs the odd unreadable commitment without opening
    // an unbounded parallel burst against the public node.
    const candidates = summaries
        .filter((s) => s.subjectId !== sagaId)
        .filter((s) => !characterIds || characterIds.has(s.subjectId))
        .slice(0, limit + 8);
    const entries = await Promise.all(
        candidates.map(async (s): Promise<PovChapterEntry | null> => {
            try {
                const res = await read.commitment.getCommitment(client, s.commitmentId);
                const json = res.json as unknown as {
                    blob_id?: number[] | string;
                    content_hash?: number[] | string;
                };
                const blobId = normalizeWalrusBlobId(json.blob_id);
                if (!blobId) return null;
                return {
                    commitmentId: s.commitmentId,
                    sagaId: s.sagaId,
                    subjectId: s.subjectId,
                    committedAtMs: s.committedAtMs,
                    blobId,
                    blobUrl: buildWalrusBlobUrl(blobId),
                    contentHashHex: decodeBytesHex(json.content_hash),
                };
            } catch {
                // Skip unreadable commitments; the rest of the feed can still render.
                return null;
            }
        }),
    );
    return entries.filter((e): e is PovChapterEntry => e !== null).slice(0, limit);
}

export async function fetchPovChapterByCommitment(
    commitmentId: string,
): Promise<PovChapterEntry | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    // A Commitment object is write-once (blob id / subject never change), so the
    // decoded entry can cache hard. generateMetadata + the page render both call
    // getChapter → this makes the second call (and every back-navigation) free.
    return cachedPublicRead(
        `pov:commitment:${commitmentId}`,
        publicChainReadTtl(60 * 60 * 1000),
        () => fetchPovChapterByCommitmentUncached(commitmentId),
    );
}

async function fetchPovChapterByCommitmentUncached(
    commitmentId: string,
): Promise<PovChapterEntry | null> {
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
        const blobId = normalizeWalrusBlobId(json.blob_id);
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
    return cachedPublicRead(`walrus:text:${blobUrl}`, publicChainReadTtl(BLOB_TEXT_TTL_MS), async () => {
        const res = await fetch(resolveServerFetchUrl(blobUrl));
        if (!res.ok) throw new Error(`walrus aggregator HTTP ${res.status}`);
        return res.text();
    });
}

/* ── internals ──────────────────────────────────────────────────── */

function buildWalrusBlobUrl(blobId: string): string {
    // Web proxy route — re-emits the Walrus aggregator response with a
    // proper UTF-8 content-type header so browsers render text blobs
    // (chapters, gazettes) instead of mojibake. Direct aggregator URL:
    //   https://aggregator.walrus-testnet.walrus.space/v1/blobs/{id}
    // returns the same bytes but with no Content-Type (browsers fall
    // through to octet-stream → mojibake). See /api/blob route handler.
    return `/api/blob/${blobId}`;
}

function resolveServerFetchUrl(blobUrl: string): string {
    const match = blobUrl.match(/^\/api\/blob\/([^/?#]+)/);
    if (!match) return blobUrl;
    return memwalBlob.getBlobUrl(decodeURIComponent(match[1]), 'testnet');
}
