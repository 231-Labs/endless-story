/**
 * Chain-side fetcher for event-cut chapters (the canonical "回").
 *
 * A cut is a commitment whose blob carries an `<!--es:cut {json}-->` header
 * (subject_id = the scene the event happened in). We scan the saga's
 * commitments and keep only those whose blob starts with that header —
 * distinguishing cuts from gazettes (subject=saga), POV (subject=character),
 * and DR-6 drama beats (JSON). The header carries the verifiable `eventTx`
 * plus the cast + scene + day for the card.
 *
 * Public surface: a cut is the public, woven product (gazette-tier visibility) —
 * see docs/CONTENT_PIPELINE.md §2/§8.1. Returns newest-first.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { eventChapter } from '@endless-story/runner';
import { resolveNetwork } from './network.js';
import { fetchChapterText } from './pov-read.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';

export interface EventCutEntry {
    commitmentId: string;
    sagaId: string;
    /** Scene the event happened in (commitment subject). */
    sceneId: string;
    sceneName?: string;
    eventLabel?: string;
    /** tx digest of the on-chain event — verifiable proof. */
    eventTx?: string;
    day?: number;
    /** Characters whose POVs were woven in. */
    povCharacterIds: string[];
    blobId: string;
    /** Browser-friendly proxy URL. */
    blobUrl: string;
    committedAtMs: string;
}

export interface FetchCutsOptions {
    /** Max entries returned (newest first). Default 20. */
    limit?: number;
}

export async function fetchEventCutsForSaga(
    sagaId: string,
    opts: FetchCutsOptions = {},
): Promise<EventCutEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 20;
    // List assembly = commitment scan + a blob header peek per candidate. Short
    // TTL keeps the feed fresh while making warm navigations near-instant; the
    // blob texts themselves cache hard (immutable) in fetchChapterText. The
    // stale window means a TTL rollover serves the old list instantly and
    // refreshes in the background instead of blocking the page.
    return cachedPublicRead(
        `cuts:saga:${sagaId}:${limit}`,
        publicChainReadTtl(30_000),
        () => fetchEventCutsForSagaUncached(sagaId, limit),
        { staleTtlMs: 10 * 60 * 1000 },
    );
}

async function fetchEventCutsForSagaUncached(
    sagaId: string,
    limit: number,
): Promise<EventCutEntry[]> {
    const client = makeSuiClient({ network: resolveNetwork() });

    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        // All saga commitments; over-fetch because POV/gazette/drama share the
        // feed and get filtered out below by the header peek.
        summaries = await read.commitment.listCommitments(client, ENDLESS_STORY_DEPLOYMENT.packageId, {
            sagaId,
            maxEvents: limit + 40,
        });
    } catch (err) {
        console.warn('[cut-read] listCommitments failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    // Resolve all candidates in parallel (commitment JSON + header peek are
    // cached); keep newest-first order and trim to limit after the filter.
    const resolved = await Promise.all(
        summaries.map(async (s): Promise<EventCutEntry | null> => {
            try {
                const res = await getCommitmentCached(client, s.commitmentId);
                const blobId = decodeByteString(res.blob_id);
                if (!blobId) return null;
                const raw = (await fetchChapterText(`/api/blob/${blobId}`)).trim();
                const { header } = eventChapter.parseCutHeader(raw);
                if (!header || header.kind !== 'event_cut') return null; // not a cut
                return {
                    commitmentId: s.commitmentId,
                    sagaId: s.sagaId,
                    sceneId: s.subjectId,
                    sceneName: header.sceneName,
                    eventLabel: header.eventLabel,
                    eventTx: header.eventTx,
                    day: header.day,
                    povCharacterIds: header.povCharacterIds ?? [],
                    blobId,
                    blobUrl: `/api/blob/${blobId}`,
                    committedAtMs: s.committedAtMs,
                };
            } catch {
                return null; // skip unreadable
            }
        }),
    );
    return resolved.filter((c): c is EventCutEntry => c != null).slice(0, limit);
}

/** A cut with its full prose body — the /feed/cut/[id] detail page payload. */
export interface EventCutDetail extends EventCutEntry {
    body: string;
}

/**
 * Fetch ONE cut by its commitment id. Returns null when the commitment doesn't
 * exist or its blob isn't an `es:cut` document (e.g. someone pasted a POV
 * commitment id). Commitment + blob are immutable → both reads cache hard.
 */
export async function fetchEventCut(commitmentId: string): Promise<EventCutDetail | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const json = await getCommitmentCached(client, commitmentId);
        const blobId = decodeByteString(json.blob_id);
        if (!blobId) return null;
        const raw = (await fetchChapterText(`/api/blob/${blobId}`)).trim();
        const { header, body } = eventChapter.parseCutHeader(raw);
        if (!header || header.kind !== 'event_cut') return null;
        return {
            commitmentId,
            sagaId: json.saga_id ?? ENDLESS_STORY_DEPLOYMENT.sagaId,
            sceneId: json.subject_id ?? '',
            sceneName: header.sceneName,
            eventLabel: header.eventLabel,
            eventTx: header.eventTx,
            day: header.day,
            povCharacterIds: header.povCharacterIds ?? [],
            blobId,
            blobUrl: `/api/blob/${blobId}`,
            committedAtMs: String(json.committed_at_ms ?? '0'),
            body,
        };
    } catch {
        return null;
    }
}

interface CommitmentJson {
    saga_id?: string;
    subject_id?: string;
    committed_at_ms?: string | number;
    blob_id?: number[] | string;
}

/** Commitment objects are write-once → cache the decoded JSON hard. */
function getCommitmentCached(
    client: ReturnType<typeof makeSuiClient>,
    commitmentId: string,
): Promise<CommitmentJson> {
    return cachedPublicRead(
        `cut:commitment:${commitmentId}`,
        publicChainReadTtl(60 * 60 * 1000),
        async () => {
            const res = await read.commitment.getCommitment(client, commitmentId);
            return res.json as unknown as CommitmentJson;
        },
    );
}

function decodeByteString(raw: number[] | string | undefined): string {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
        try {
            return new TextDecoder().decode(new Uint8Array(raw));
        } catch {
            return '';
        }
    }
    return '';
}
