/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Commitment — Layer 1 (產品層) memory provenance anchor.
 * 
 * **What this is**: a saga-scoped, storyteller-signed record on chain that says
 * "blob X (with content hash H) is the canonical thing committed for subject Y at
 * time T". Discovered via the `CommitmentCreated` event log, indexed off-chain by
 * (saga_id, subject_id).
 * 
 * **What this is NOT** (intentionally — see Layer 2 notes below):
 * 
 * - a chain-of-hashes / parent-linked history
 * - a cryptographic replay proof of agent decisions
 * - a multi-kind commitment registry
 * 
 * **Auth**: caller must hold the `StorytellerCap` of the saga. Anyone can READ the
 * resulting shared object or scan events.
 * 
 * **Layer 2 (research) note**: when the博班 "verifiable agent decision chain"
 * research module gets built, it will live in a SEPARATE package and may either
 * (a) wrap these commitments in its own ChainedCommit struct, or (b) define an
 * independent commit type. This module makes no affordance for that future work —
 * keeping it lean so the product surface stays small and stable.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::commitment';
export const Commitment = new MoveStruct({ name: `${$moduleName}::Commitment`, fields: {
        id: bcs.Address,
        /** Saga this commitment belongs to. Lets readers filter by world arc. */
        saga_id: bcs.Address,
        /**
         * Free-form subject — typically `character_id`, but the module does not enforce a
         * type so future surfaces (scene-level commits, saga- level commits) can reuse the
         * struct.
         */
        subject_id: bcs.Address,
        /**
         * Hash of the committed content. Caller's responsibility to pick a hash function
         * and pre-hash off-chain; module treats it as opaque bytes so we don't lock in an
         * algorithm.
         */
        content_hash: bcs.vector(bcs.u8()),
        /**
         * Walrus blob id (or any other off-chain storage reference). Opaque bytes; readers
         * know how to resolve based on application context.
         */
        blob_id: bcs.vector(bcs.u8()),
        /**
         * Address that signed the commit (= the StorytellerCap holder at time of commit).
         * Useful for audit even though the cap itself can be transferred later.
         */
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
        blobId: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Publish a commitment. Storyteller-only.
 *
 * Lifecycle:
 *
 * 1.  caller hashes the off-chain blob, uploads to Walrus, gets blob_id
 * 2.  caller invokes `commit(cap, saga, subject_id, hash, blob_id, ...)`
 * 3.  module creates shared Commitment, emits CommitmentCreated
 *
 * The caller chooses `subject_id` — it is not validated against any existing
 * object on chain. This is deliberate: it lets us commit for subjects that may not
 * be Move objects (off-chain entities) and keeps the module independent of
 * character/scene module APIs. Misuse (e.g. committing for a non-existent id) is
 * caught by the caller's own indexing logic, not on chain.
 */
export function commit(options: CommitOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        'vector<u8>',
        'vector<u8>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "subjectId", "contentHash", "blobId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'commit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CommitmentIdArguments {
    c: RawTransactionArgument<string>;
}
export interface CommitmentIdOptions {
    package?: string;
    arguments: CommitmentIdArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function commitmentId(options: CommitmentIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'commitment_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaIdArguments {
    c: RawTransactionArgument<string>;
}
export interface SagaIdOptions {
    package?: string;
    arguments: SagaIdArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function sagaId(options: SagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubjectIdArguments {
    c: RawTransactionArgument<string>;
}
export interface SubjectIdOptions {
    package?: string;
    arguments: SubjectIdArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function subjectId(options: SubjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'subject_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ContentHashArguments {
    c: RawTransactionArgument<string>;
}
export interface ContentHashOptions {
    package?: string;
    arguments: ContentHashArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function contentHash(options: ContentHashOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'content_hash',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BlobIdArguments {
    c: RawTransactionArgument<string>;
}
export interface BlobIdOptions {
    package?: string;
    arguments: BlobIdArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function blobId(options: BlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CommitterArguments {
    c: RawTransactionArgument<string>;
}
export interface CommitterOptions {
    package?: string;
    arguments: CommitterArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function committer(options: CommitterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'committer',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CommittedAtMsArguments {
    c: RawTransactionArgument<string>;
}
export interface CommittedAtMsOptions {
    package?: string;
    arguments: CommittedAtMsArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function committedAtMs(options: CommittedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'commitment',
        function: 'committed_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}