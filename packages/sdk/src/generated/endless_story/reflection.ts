/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Reflection — character interior monologue, anchored on chain.
 * 
 * **What this is**: a separate-from-POV memory artefact. POV chapters are the
 * character's _public_ face (what they say + do in scene). Reflections are the
 * _private_ face (what they really felt, alone off-stage). The two can — and often
 * should — contradict each other.
 * 
 * **Two activation paths**:
 * 
 * - **Active**: owner pays a small ENDLESS (Phase 1 demo: free) and asks a
 *   specific question; LLM writes the character's answer.
 * - **Passive**: importance debt accumulates from POV chapters; once the threshold
 *   is crossed, runner triggers a free-form reflection (no question, just the
 *   character's interior at this moment).
 * 
 * **Why a separate module from commitment.move**: reflections share the same
 * anchor pattern (hash + walrus blob_id) but have distinct semantics — `mode`,
 * optional `question`, separate visibility tier. Keeping them in a dedicated event
 * stream lets web filter cleanly without parsing content frontmatter.
 * 
 * **Auth**: storyteller cap. Owner-initiated reflections go through the runner
 * (server signs); chain doesn't verify the owner relationship because the runner
 * already does (off-chain auth + LLM gating). This keeps the contract surface
 * small — no need to bring OwnerCap in.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::reflection';
export const Reflection = new MoveStruct({ name: `${$moduleName}::Reflection`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        /** The character this reflection belongs to. */
        character_id: bcs.Address,
        /**
         * "active" (owner-initiated, has `question`) or "passive" (runner-triggered,
         * free-form).
         */
        mode: bcs.string(),
        /** When mode = "active", the owner's question. Empty otherwise. */
        question: bcs.string(),
        /** Hash of the reflection prose (walrus content). */
        content_hash: bcs.vector(bcs.u8()),
        /** Walrus blob id. */
        blob_id: bcs.vector(bcs.u8()),
        /**
         * 0–10 importance — passive may bump character's debt counter resetting after
         * reflection; active is typically higher because the owner is paying attention.
         * Default: active=7, passive=6.
         */
        importance: bcs.u8(),
        committed_at_ms: bcs.u64()
    } });
export const ReflectionCommitted = new MoveStruct({ name: `${$moduleName}::ReflectionCommitted`, fields: {
        reflection_id: bcs.Address,
        saga_id: bcs.Address,
        character_id: bcs.Address,
        mode: bcs.string(),
        /**
         * Echoed for indexer convenience (cheaper than fetching the Reflection object per
         * row).
         */
        question: bcs.string(),
        importance: bcs.u8(),
        committed_at_ms: bcs.u64()
    } });
export interface SubmitArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    characterId: RawTransactionArgument<string>;
    mode: RawTransactionArgument<string>;
    question: RawTransactionArgument<string>;
    contentHash: RawTransactionArgument<Array<number>>;
    blobId: RawTransactionArgument<Array<number>>;
    importance: RawTransactionArgument<number>;
}
export interface SubmitOptions {
    package?: string;
    arguments: SubmitArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        characterId: RawTransactionArgument<string>,
        mode: RawTransactionArgument<string>,
        question: RawTransactionArgument<string>,
        contentHash: RawTransactionArgument<Array<number>>,
        blobId: RawTransactionArgument<Array<number>>,
        importance: RawTransactionArgument<number>
    ];
}
/**
 * Storyteller (runner) anchors a reflection.
 *
 * Caller responsibility:
 *
 * 1.  Run reflection LLM (active mode includes question + character context;
 *     passive mode is free-form interior)
 * 2.  Upload to Walrus → blob_id
 * 3.  Hash optimised bytes → content_hash
 * 4.  Call this entry with cap + payload
 */
export function submit(options: SubmitOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x1::string::String',
        '0x1::string::String',
        'vector<u8>',
        'vector<u8>',
        'u8',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "characterId", "mode", "question", "contentHash", "blobId", "importance"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'submit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionIdArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionIdOptions {
    package?: string;
    arguments: ReflectionIdArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionId(options: ReflectionIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionCharacterIdArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionCharacterIdOptions {
    package?: string;
    arguments: ReflectionCharacterIdArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionCharacterId(options: ReflectionCharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionSagaIdArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionSagaIdOptions {
    package?: string;
    arguments: ReflectionSagaIdArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionSagaId(options: ReflectionSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionModeArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionModeOptions {
    package?: string;
    arguments: ReflectionModeArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionMode(options: ReflectionModeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_mode',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionQuestionArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionQuestionOptions {
    package?: string;
    arguments: ReflectionQuestionArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionQuestion(options: ReflectionQuestionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_question',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionContentHashArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionContentHashOptions {
    package?: string;
    arguments: ReflectionContentHashArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionContentHash(options: ReflectionContentHashOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_content_hash',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionBlobIdArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionBlobIdOptions {
    package?: string;
    arguments: ReflectionBlobIdArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionBlobId(options: ReflectionBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionImportanceArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionImportanceOptions {
    package?: string;
    arguments: ReflectionImportanceArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionImportance(options: ReflectionImportanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_importance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReflectionCommittedAtMsArguments {
    r: RawTransactionArgument<string>;
}
export interface ReflectionCommittedAtMsOptions {
    package?: string;
    arguments: ReflectionCommittedAtMsArguments | [
        r: RawTransactionArgument<string>
    ];
}
export function reflectionCommittedAtMs(options: ReflectionCommittedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'reflection',
        function: 'reflection_committed_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}