/**
 * Chain-side fetcher for 排戲/劇目 productions (the 戲折).
 *
 * A production is a commitment whose blob carries an `<!--es:production {json}-->`
 * header, anchored with `subject_id == sagaId` — the SAME subject gazettes use.
 * So we scan the saga-subject commitments and keep ONLY those whose blob is an
 * es:production doc, distinguishing them from gazettes (prose, no header) and
 * DR-6 drama beats (JSON). The header carries productionId / classicSource /
 * title / castIds / day for the card.
 *
 * Companion fix lives in gazette-read.isNonGazetteBlob (now also excludes
 * es:production) so a production never leaks into the 公報 tab (shared subject).
 *
 * Returns newest-first. See docs/PRODUCTION_ENGINE.md §10. Caller fetches the
 * 戲折 markdown via `/api/blob/{blobId}` (proxy) / the shared cached text fetch.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { production } from '@endless-story/runner';
import { resolveNetwork } from './network.js';
import { fetchChapterText } from './pov-read.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';

const LIST_STALE_MS = 10 * 60 * 1000;

export interface ProductionEntry {
    commitmentId: string;
    sagaId: string;
    productionId: string;
    classicKey: string;
    classicSource?: string;
    title?: string;
    /** on-chain Character ids of the cast (co-owners / provenance). */
    castIds: string[];
    day?: number;
    blobId: string;
    /** Browser-friendly proxy URL. */
    blobUrl: string;
    committedAtMs: string;
}

export interface ProductionDetail extends ProductionEntry {
    body: string;
}

export interface FetchProductionsOptions {
    /** Max entries returned (newest first). Default 20. */
    limit?: number;
}

export async function fetchProductionsForSaga(
    sagaId: string,
    opts: FetchProductionsOptions = {},
): Promise<ProductionEntry[]> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return [];
    const limit = opts.limit ?? 20;
    return cachedPublicRead(
        `productions:saga:${sagaId}:${limit}`,
        publicChainReadTtl(120_000),
        () => fetchProductionsForSagaUncached(sagaId, limit),
        { staleTtlMs: LIST_STALE_MS },
    );
}

async function fetchProductionsForSagaUncached(
    sagaId: string,
    limit: number,
): Promise<ProductionEntry[]> {
    const client = makeSuiClient({ network: resolveNetwork() });

    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        summaries = await read.commitment.listCommitments(client, ENDLESS_STORY_DEPLOYMENT.packageId, {
            sagaId,
            subjectId: sagaId, // productions anchor on the saga (like gazettes); es:production filter below
            // gazettes + drama beats share this subject and get filtered out, so over-fetch.
            maxEvents: limit + 24,
        });
    } catch (err) {
        console.warn('[production-read] listCommitments failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    const resolved = await Promise.all(
        summaries.map(async (s): Promise<ProductionEntry | null> => {
            try {
                const json = await getCommitmentCached(client, s.commitmentId);
                const blobId = decodeByteString(json.blob_id);
                if (!blobId) return null;
                const raw = (await fetchChapterText(`/api/blob/${blobId}`)).trim();
                const { header } = production.parseProductionHeader(raw);
                if (!header || header.kind !== 'production') return null; // not a 戲折
                return {
                    commitmentId: s.commitmentId,
                    sagaId: s.sagaId,
                    productionId: header.productionId,
                    classicKey: header.classicKey,
                    classicSource: header.classicSource,
                    title: header.title,
                    castIds: header.castIds ?? [],
                    day: header.day,
                    blobId,
                    blobUrl: `/api/blob/${blobId}`,
                    committedAtMs: s.committedAtMs,
                };
            } catch {
                return null; // skip unreadable
            }
        }),
    );
    return resolved.filter((p): p is ProductionEntry => p != null).slice(0, limit);
}

/** One production with its full 戲折 prose — the /feed/production/[id] detail page. */
export async function fetchProduction(commitmentId: string): Promise<ProductionDetail | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const json = await getCommitmentCached(client, commitmentId);
        const blobId = decodeByteString(json.blob_id);
        if (!blobId) return null;
        const raw = (await fetchChapterText(`/api/blob/${blobId}`)).trim();
        const { header, body } = production.parseProductionHeader(raw);
        if (!header || header.kind !== 'production') return null;
        return {
            commitmentId,
            sagaId: json.saga_id ?? ENDLESS_STORY_DEPLOYMENT.sagaId,
            productionId: header.productionId,
            classicKey: header.classicKey,
            classicSource: header.classicSource,
            title: header.title,
            castIds: header.castIds ?? [],
            day: header.day,
            blobId,
            blobUrl: `/api/blob/${blobId}`,
            committedAtMs: String(json.committed_at_ms ?? '0'),
            body,
        };
    } catch {
        return null;
    }
}

/* ── internals (clone of cut-read) ──────────────────────────── */

interface CommitmentJson {
    saga_id?: string;
    subject_id?: string;
    committed_at_ms?: string | number;
    blob_id?: number[] | string;
}

function getCommitmentCached(
    client: ReturnType<typeof makeSuiClient>,
    commitmentId: string,
): Promise<CommitmentJson> {
    return cachedPublicRead(
        `production:commitment:${commitmentId}`,
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
