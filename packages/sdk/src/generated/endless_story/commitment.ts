/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
/* Hand-edited 2026-05-26: sui-ts-codegen 0.10.6 incompat with Node 18
   (`import.meta.dirname`). Re-run codegen on Node 20+ if regenerating. */


/**
 * Commitment — Layer 1 (產品層) memory provenance anchor.
 *
 * A saga-scoped, storyteller-signed record on chain. Discovered via the
 * `CommitmentCreated` event log, indexed off-chain by (saga_id, subject_id).
 * Intentionally minimal — no parent chain, no kind variants. See
 * `contracts/endless_story/sources/commitment.move` header for the full
 * design rationale (Layer 1 vs Layer 2 research split).
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::commitment';

export const Commitment = new MoveStruct({ name: `${$moduleName}::Commitment`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        subject_id: bcs.Address,
        content_hash: bcs.vector(bcs.u8()),
        blob_id: bcs.vector(bcs.u8()),
        committer: bcs.Address,
        committed_at_ms: bcs.u64()
    } });

export const CommitmentCreated = new MoveStruct({ name: `${$moduleName}::CommitmentCreated`, fields: {
        commitment_id: bcs.Address,
        saga_id: bcs.Address,
        subject_id: bcs.Address,
        committer: bcs.Address,
        committed_at_ms: bcs.u64()
    } });

// ─── commit() ────────────────────────────────────────────────────────

export interface CommitArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    subjectId: RawTransactionArgument<string>;
    contentHash: RawTransactionArgument<Array<number>>;
    blobId: RawTransactionArgument<Array<number>>;
}
export interface CommitOptions {
    package?: string;
    arguments: CommitArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        subjectId: RawTransactionArgument<string>,
        contentHash: RawTransactionArgument<Array<number>>,
        blobId: RawTransactionArgument<Array<number>>,
    ];
}
export function commit(options: CommitOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,                       // cap: &StorytellerCap
        null,                       // saga: &Saga
        '0x2::object::ID',          // subject_id
        'vector<u8>',               // content_hash
        'vector<u8>',               // blob_id
        '0x2::clock::Clock',        // clock (auto)
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "subjectId", "contentHash", "blobId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'commit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
