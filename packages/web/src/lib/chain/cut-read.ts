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
import { blob as memwalBlob } from '@endless-story/memwal';
import { eventChapter } from '@endless-story/runner';
import { resolveNetwork } from './network.js';

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
    const client = makeSuiClient({ network: resolveNetwork() });
    const network = resolveNetwork();
    const walrusNet = network === 'mainnet' ? 'mainnet' : 'testnet';

    let summaries: Awaited<ReturnType<typeof read.commitment.listCommitments>>;
    try {
        // All saga commitments; over-fetch because POV/gazette/drama share the
        // feed and get filtered out below by the header peek.
        summaries = await read.commitment.listCommitments(client, pkg, {
            sagaId,
            maxEvents: limit + 40,
        });
    } catch (err) {
        console.warn('[cut-read] listCommitments failed:', err);
        return [];
    }
    if (summaries.length === 0) return [];

    const out: EventCutEntry[] = [];
    for (const s of summaries) {
        if (out.length >= limit) break;
        try {
            const res = await read.commitment.getCommitment(client, s.commitmentId);
            const json = res.json as unknown as { blob_id?: number[] | string };
            const blobId = decodeByteString(json.blob_id);
            if (!blobId) continue;
            const r = await fetch(memwalBlob.getBlobUrl(blobId, walrusNet), { cache: 'no-store' });
            if (!r.ok) continue;
            const raw = (await r.text()).trim();
            const { header } = eventChapter.parseCutHeader(raw);
            if (!header || header.kind !== 'event_cut') continue; // not a cut
            out.push({
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
            });
        } catch {
            // skip unreadable
        }
    }
    return out;
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
