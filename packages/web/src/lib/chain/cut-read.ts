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
 * see docs/narrative/CONTENT_PIPELINE.md §2/§8.1. Returns newest-first.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { eventChapter } from '@endless-story/runner';
import { resolveNetwork } from './network.js';
import { fetchChapterText } from './pov-read.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';
import { decodeByteString } from './decode.js';

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
    // List assembly = a FULL saga commitment scan (§⑨: cuts are old + scattered,
    // so we page the whole log) + a blob header peek per candidate. That scan is
    // the single most RPC-heavy public read, and new cuts are rare — so the fresh
    // TTL is generous (2 min) and the stale window long: a feed poll almost never
    // triggers the scan, and a TTL rollover serves the old list instantly while
    // ONE background refresh runs. Blob texts cache hard (immutable). This keeps
    // the feed from amplifying RPC load into the public-fullnode 429 ceiling.
    return cachedPublicRead(
        `cuts:saga:${sagaId}:${limit}`,
        publicChainReadTtl(120_000),
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
        // Scan the FULL saga commitment log — cuts are a tiny, scattered
        // minority. The log is dominated by DR-6 drama beats (subject=world)
        // and gazettes (subject=saga), both of which grow every tick; a fixed
        // over-fetch window buries the (rarer, older) cuts and the feed reads
        // empty even when chapters exist. queryEvents has no subject-type
        // predicate, so we page to the end and filter in memory. Bounded by the
        // 30s + stale-window cache above.
        summaries = await read.commitment.listCommitments(client, ENDLESS_STORY_DEPLOYMENT.packageId, {
            sagaId,
        });
    } catch (err) {
        console.warn('[cut-read] listCommitments failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    // A cut's subject is always one of the saga's anchored scenes (gazettes
    // sit on the saga, POVs on a character, drama beats on the world). Keep
    // only scene-subject commitments BEFORE the per-candidate blob peek, so the
    // peek count tracks the number of cuts — not the unbounded drama/POV flood.
    const sceneSubjects = new Set(ENDLESS_STORY_DEPLOYMENT.sceneIds);
    const candidates = summaries.filter((s) => sceneSubjects.has(s.subjectId));
    if (candidates.length === 0) return [];

    // Resolve all candidates in parallel (commitment JSON + header peek are
    // cached); keep newest-first order and trim to limit after the filter.
    const resolved = await Promise.all(
        candidates.map(async (s): Promise<EventCutEntry | null> => {
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
    const cuts = resolved.filter((c): c is EventCutEntry => c != null).slice(0, limit);
    // [ch-diag] read-side census: scanned = whole saga commitment log; candidates
    // = scene-subject (the §⑨ pre-filter); cuts = those whose blob is an es:cut.
    // Grep `[ch-diag] cut-read`: candidates>0 but cuts=0 means scene commitments
    // exist whose blobs aren't event_cut (mis-subject?) — distinct from the feed
    // reading empty because none were ever woven (candidates=0).
    console.log(
        `[ch-diag] cut-read saga=${sagaId.slice(0, 10)} scanned=${summaries.length} ` +
            `candidates=${candidates.length} cuts=${cuts.length}`,
    );
    return cuts;
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

