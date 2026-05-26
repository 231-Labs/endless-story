/**
 * sign-and-anchor — the canonical pattern for every runner output.
 *
 * Every chapter, gazette, reflection, dream, and video produced by any
 * service flows through this helper:
 *
 *   1. hash(content) → SHA-256 / blake2b (caller picks; opaque to chain)
 *   2. memwal.putBlob(content) → Walrus blob id
 *   3. commitment::commit(saga, subject, hash, blob_id, hint?) → chain anchor
 *   4. caller can `emit *Committed` event afterwards if needed
 *
 * Why centralised: the 4-step sequence has subtle ordering rules (hash
 * MUST come from the exact bytes uploaded, blob id MUST match), and
 * we want all services to write the same shape. Future verifiers (web
 * UI, third-party indexers) read the commitment event log → fetch
 * blob → re-hash → verify in one place.
 *
 * Skeleton only — implementation lands in R2 when first real producer
 * (character POV worker) needs it.
 */

import type { Transaction } from '@mysten/sui/transactions';

export interface SignAndAnchorInput {
    /** The off-chain Saga id this content belongs to. */
    sagaId: string;
    /** Subject id — typically character_id, but free-form (storylet_id,
     *  scene_id, saga_id itself all valid). */
    subjectId: string;
    /** Raw content bytes that will be uploaded + hashed. */
    content: Uint8Array;
    /** Optional caller-supplied tag (e.g. storylet_id, recruitment_id,
     *  kind discriminator). Echoed in event log for indexing. */
    hint?: string;
}

export interface SignAndAnchorResult {
    /** Sui object id of the created Commitment. */
    commitmentId: string;
    /** Walrus blob id where content lives. */
    blobId: string;
    /** Hex content hash matching the on-chain `content_hash` field. */
    contentHashHex: string;
    /** Transaction digest. */
    digest: string;
}

/**
 * Anchor content on chain. Returns the commitment id + blob id so
 * caller can emit downstream events referencing this artifact.
 *
 * TODO(R2): wire to memwal.putBlob + endlessTx.commitment.commit. For
 * R0 this is a typed shell only.
 */
export async function signAndAnchor(_input: SignAndAnchorInput): Promise<SignAndAnchorResult> {
    throw new Error('signAndAnchor: not yet implemented (lands in R2)');
}

/**
 * PTB-only variant — for callers building a larger transaction.
 * Pushes the commit call onto an existing Transaction; caller signs
 * and executes. Returns nothing because the commitmentId is only known
 * after execution.
 *
 * TODO(R2): implement.
 */
export function pushCommitCall(_tx: Transaction, _input: SignAndAnchorInput): void {
    throw new Error('pushCommitCall: not yet implemented (lands in R2)');
}
