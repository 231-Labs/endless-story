/**
 * Commitment view queries — `getCommitment` + event-log list.
 *
 * Listing is event-driven (no on-chain index for "all commitments for
 * subject X"), mirroring how `read.character.listMintedCharacters` works.
 * Off-chain caller filters the parsed events; we don't post-filter at
 * the RPC layer because `queryEvents` only supports MoveEventType, not
 * field predicates.
 */
import * as gen from '../generated/endless_story/commitment.js';
import type { SuiClient } from '../client.js';
import { scanEvents } from './query-retry.js';

export { gen as raw };

export const getCommitment = (client: SuiClient, commitmentId: string) =>
    gen.Commitment.get({ client, objectId: commitmentId });

export const getManyCommitments = (client: SuiClient, ids: string[]) =>
    gen.Commitment.getMany({ client, objectIds: ids });

/** One row of the `CommitmentCreated` event log. */
export interface CommitmentSummary {
    commitmentId: string;
    sagaId: string;
    subjectId: string;
    committer: string;
    committedAtMs: string;
    /** `txDigest` / `eventSeq` from the SuiEvent envelope. Useful for stable
     *  client-side ordering even when timestamps collide. */
    txDigest: string;
    eventSeq: string;
}

export interface ListCommitmentsOptions {
    /** Filter: only commitments under this saga. Omit → all sagas. */
    sagaId?: string;
    /** Filter: only commitments for this subject id. Omit → all subjects. */
    subjectId?: string;
    /** Filter: only commitments by this committer address. */
    committer?: string;
    /** Cap on events scanned. Default unlimited (paginates to end). */
    maxEvents?: number;
}

/**
 * Scan `CommitmentCreated` events for the deployed package, newest first.
 *
 * **Caveats**:
 *   - Events from BURNED commitment objects (none should exist — module
 *     never deletes — but defensive) would still appear.
 *   - For "latest commitment for subject X" use `findLatestCommitment`
 *     which short-circuits on first match.
 */
export async function listCommitments(
    client: SuiClient,
    packageId: string,
    opts: ListCommitmentsOptions = {},
): Promise<CommitmentSummary[]> {
    const eventType = `${packageId}::commitment::CommitmentCreated`;
    const out: CommitmentSummary[] = [];
    const cap = opts.maxEvents ?? Infinity;

    await scanEvents(client, eventType, (raw, ev) => {
        const parsed = raw as Partial<{
            commitment_id: string;
            saga_id: string;
            subject_id: string;
            committer: string;
            committed_at_ms: string | number;
        }>;
        if (!parsed.commitment_id) return;
        const sagaId = parsed.saga_id ?? '';
        const subjectId = parsed.subject_id ?? '';
        const committer = parsed.committer ?? '';
        if (opts.sagaId && sagaId !== opts.sagaId) return;
        if (opts.subjectId && subjectId !== opts.subjectId) return;
        if (opts.committer && committer !== opts.committer) return;
        out.push({
            commitmentId: parsed.commitment_id,
            sagaId,
            subjectId,
            committer,
            committedAtMs: String(parsed.committed_at_ms ?? '0'),
            txDigest: ev.id.txDigest,
            eventSeq: ev.id.eventSeq,
        });
        if (out.length >= cap) return false;
    });
    return out;
}

/**
 * Convenience: returns the most recent commitment matching the filters,
 * or null if none exist. Stops scanning at the first hit (cheaper than
 * `listCommitments(...)[0]` for tail-only consumers).
 */
export async function findLatestCommitment(
    client: SuiClient,
    packageId: string,
    opts: ListCommitmentsOptions = {},
): Promise<CommitmentSummary | null> {
    const list = await listCommitments(client, packageId, { ...opts, maxEvents: 1 });
    return list[0] ?? null;
}
