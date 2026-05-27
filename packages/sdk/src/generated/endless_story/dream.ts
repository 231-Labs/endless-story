/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Dream — owner-paid memory injection.
 * 
 * **What this is**: a Character owner pays ENDLESS to inject a dream fragment into
 * their character's memory. The fragment is moderated
 * 
 * - optimised off-chain (server-side LLM) before submission, then anchored on
 *   chain with high importance so the runner's POV worker surfaces it on the next
 *   chapter.
 * 
 * **Authentication**: caller must hold the `OwnerCap` matching the target
 * Character. This binds dream submission to NFT ownership — only the rightful
 * character owner can shape their memory.
 * 
 * **Payment**: `submit_dream` takes a `Coin<CURRENCY>` of at least
 * `DreamConfig.price` and deposits it into the saga's treasury. Admin can adjust
 * price + pause via `set_dream_price` / `set_paused` using `DreamAdminCap`.
 * Default price = 50 ENDLESS (50_000_000 raw with 6 decimals).
 * 
 * **Visibility**: Dream is a shared object so the runner / web can read it without
 * owner gating. The CONTENT lives on Walrus; only the hash + blob_id are on chain.
 * `importance: u8` defaults to 8 of 10 — when the POV worker pulls memories for
 * prompt, dreams jump to the top of recall.
 * 
 * **Why not commitment.move**: dream needs payment + auth that aren't in
 * commitment's surface. Keeping commitment lean (Layer 1 product anchor) and
 * giving dream its own module is cleaner.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::dream';
export const DreamConfig = new MoveStruct({ name: `${$moduleName}::DreamConfig`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        /** Minimum ENDLESS required to submit a dream (raw units, 6 decimals). */
        price: bcs.u64(),
        paused: bcs.bool()
    } });
export const DreamAdminCap = new MoveStruct({ name: `${$moduleName}::DreamAdminCap`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address
    } });
export const Dream = new MoveStruct({ name: `${$moduleName}::Dream`, fields: {
        id: bcs.Address,
        character_id: bcs.Address,
        saga_id: bcs.Address,
        /**
         * Address that paid for + submitted the dream (= OwnerCap holder at time of
         * submission).
         */
        submitter: bcs.Address,
        /** Raw ENDLESS amount deposited into saga treasury. */
        paid_amount: bcs.u64(),
        /** Hash of the moderated dream content. */
        content_hash: bcs.vector(bcs.u8()),
        /** Walrus blob id (caller's responsibility to upload before calling this entry). */
        blob_id: bcs.vector(bcs.u8()),
        /**
         * 0–10 importance — POV worker uses this to weight recall. Server-side moderator
         * picks; default 8.
         */
        importance: bcs.u8(),
        injected_at_ms: bcs.u64()
    } });
export const DreamConfigCreated = new MoveStruct({ name: `${$moduleName}::DreamConfigCreated`, fields: {
        config_id: bcs.Address,
        saga_id: bcs.Address,
        price: bcs.u64()
    } });
export const DreamConfigUpdated = new MoveStruct({ name: `${$moduleName}::DreamConfigUpdated`, fields: {
        config_id: bcs.Address,
        saga_id: bcs.Address,
        new_price: bcs.u64(),
        paused: bcs.bool(),
        updated_at_ms: bcs.u64()
    } });
export const DreamInjected = new MoveStruct({ name: `${$moduleName}::DreamInjected`, fields: {
        dream_id: bcs.Address,
        character_id: bcs.Address,
        saga_id: bcs.Address,
        submitter: bcs.Address,
        paid_amount: bcs.u64(),
        importance: bcs.u8(),
        injected_at_ms: bcs.u64()
    } });
export interface CreateConfigArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    initialPrice: RawTransactionArgument<number | bigint>;
}
export interface CreateConfigOptions {
    package?: string;
    arguments: CreateConfigArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        initialPrice: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Storyteller creates the DreamConfig (one per saga, at bootstrap). Default price
 * = 50 ENDLESS. Admin cap transferred to caller.
 */
export function createConfig(options: CreateConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "initialPrice"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'create_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetDreamPriceArguments {
    admin: RawTransactionArgument<string>;
    config: RawTransactionArgument<string>;
    newPrice: RawTransactionArgument<number | bigint>;
}
export interface SetDreamPriceOptions {
    package?: string;
    arguments: SetDreamPriceArguments | [
        admin: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        newPrice: RawTransactionArgument<number | bigint>
    ];
}
export function setDreamPrice(options: SetDreamPriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "config", "newPrice"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'set_dream_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetPausedArguments {
    admin: RawTransactionArgument<string>;
    config: RawTransactionArgument<string>;
    paused: RawTransactionArgument<boolean>;
}
export interface SetPausedOptions {
    package?: string;
    arguments: SetPausedArguments | [
        admin: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        paused: RawTransactionArgument<boolean>
    ];
}
export function setPaused(options: SetPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'bool',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["admin", "config", "paused"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'set_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubmitDreamArguments {
    config: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    ownerCap: RawTransactionArgument<string>;
    payment: RawTransactionArgument<string>;
    contentHash: RawTransactionArgument<Array<number>>;
    blobId: RawTransactionArgument<Array<number>>;
    importance: RawTransactionArgument<number>;
}
export interface SubmitDreamOptions {
    package?: string;
    arguments: SubmitDreamArguments | [
        config: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        ownerCap: RawTransactionArgument<string>,
        payment: RawTransactionArgument<string>,
        contentHash: RawTransactionArgument<Array<number>>,
        blobId: RawTransactionArgument<Array<number>>,
        importance: RawTransactionArgument<number>
    ];
}
/**
 * Owner pays ENDLESS + submits a moderated dream blob ref.
 *
 * Caller responsibilities (off chain):
 *
 * 1.  Send raw text to moderator LLM → get optimised text
 * 2.  Upload optimised text to Walrus → get blob_id
 * 3.  Hash the optimised bytes → content_hash
 * 4.  Sign + send this entry with payment Coin
 *
 * On chain we verify: cap matches character, character belongs to saga, config
 * matches saga, not paused, payment >= price. Treasury deposit happens here; no
 * refund path (rejected dreams never reach the chain — that's the moderator's
 * job).
 */
export function submitDream(options: SubmitDreamOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'u8',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["config", "saga", "character", "ownerCap", "payment", "contentHash", "blobId", "importance"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'submit_dream',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigPriceArguments {
    c: RawTransactionArgument<string>;
}
export interface ConfigPriceOptions {
    package?: string;
    arguments: ConfigPriceArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function configPrice(options: ConfigPriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'config_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigPausedArguments {
    c: RawTransactionArgument<string>;
}
export interface ConfigPausedOptions {
    package?: string;
    arguments: ConfigPausedArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function configPaused(options: ConfigPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'config_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigSagaIdArguments {
    c: RawTransactionArgument<string>;
}
export interface ConfigSagaIdOptions {
    package?: string;
    arguments: ConfigSagaIdArguments | [
        c: RawTransactionArgument<string>
    ];
}
export function configSagaId(options: ConfigSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'config_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DreamCharacterIdArguments {
    d: RawTransactionArgument<string>;
}
export interface DreamCharacterIdOptions {
    package?: string;
    arguments: DreamCharacterIdArguments | [
        d: RawTransactionArgument<string>
    ];
}
export function dreamCharacterId(options: DreamCharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["d"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'dream_character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DreamSubmitterArguments {
    d: RawTransactionArgument<string>;
}
export interface DreamSubmitterOptions {
    package?: string;
    arguments: DreamSubmitterArguments | [
        d: RawTransactionArgument<string>
    ];
}
export function dreamSubmitter(options: DreamSubmitterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["d"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'dream_submitter',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DreamImportanceArguments {
    d: RawTransactionArgument<string>;
}
export interface DreamImportanceOptions {
    package?: string;
    arguments: DreamImportanceArguments | [
        d: RawTransactionArgument<string>
    ];
}
export function dreamImportance(options: DreamImportanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["d"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'dream_importance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DreamContentHashArguments {
    d: RawTransactionArgument<string>;
}
export interface DreamContentHashOptions {
    package?: string;
    arguments: DreamContentHashArguments | [
        d: RawTransactionArgument<string>
    ];
}
export function dreamContentHash(options: DreamContentHashOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["d"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'dream_content_hash',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DreamBlobIdArguments {
    d: RawTransactionArgument<string>;
}
export interface DreamBlobIdOptions {
    package?: string;
    arguments: DreamBlobIdArguments | [
        d: RawTransactionArgument<string>
    ];
}
export function dreamBlobId(options: DreamBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["d"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'dream_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DreamInjectedAtMsArguments {
    d: RawTransactionArgument<string>;
}
export interface DreamInjectedAtMsOptions {
    package?: string;
    arguments: DreamInjectedAtMsArguments | [
        d: RawTransactionArgument<string>
    ];
}
export function dreamInjectedAtMs(options: DreamInjectedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["d"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'dream',
        function: 'dream_injected_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}