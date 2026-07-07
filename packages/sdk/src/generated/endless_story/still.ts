/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * 劇照 Still — a collectible moment from the living narrative.
 * 
 * The narrative engine paints event-moment images (stored on Walrus). This module
 * mints such a moment as an ownable, Kiosk-tradeable NFT — the demand side of the
 * character economy: a fan collects the 劇照 of a scene they love; proceeds can
 * flow back to the saga treasury / the character (royalty wiring is a follow-up —
 * see docs/narrative/CHARACTER_ECONOMY.md).
 * 
 * Edition model (戲單/沖印): ONE moment (= one Walrus image) can be collected by
 * MANY fans. The shared `StillRegistry` tracks, per moment key (the blob id), how
 * many editions were minted — editions auto-increment on-chain, so numbering is
 * trustless (no server-side counter to fudge). 名場面 can be capped via
 * `set_edition_limit`; uncapped moments are open editions.
 * 
 * Authority: minting + curation are StorytellerCap-gated (the troupe issues its
 * own 戲單/劇照), mirroring scene/event creation. Trading is plain Kiosk — `Still`
 * has `key + store`, no transfer-policy gymnastics in v1.
 * 
 * Display: wallets/explorers render `{title}` + `{image_url}` via the Sui Display
 * object claimed in `init`.
 * 
 * Chamber tie-in: a chamber placement can reference an owned Still through
 * `chamber::ObjectPlacement.source_object` — "在 A 的廂房看到 B 的劇照" works with
 * zero chamber.move changes.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as table from './deps/sui/table.js';
const $moduleName = '@local-pkg/endless-story::still';
export const STILL = new MoveStruct({ name: `${$moduleName}::STILL`, fields: {
        dummy_field: bcs.bool()
    } });
export const StillRegistry = new MoveStruct({ name: `${$moduleName}::StillRegistry`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        /** moment key → editions minted so far */
        minted: table.Table,
        /** moment key → max editions (absent = open edition) */
        limits: table.Table
    } });
export const StillRegistryCreated = new MoveStruct({ name: `${$moduleName}::StillRegistryCreated`, fields: {
        registry_id: bcs.Address,
        saga_id: bcs.Address
    } });
export const Still = new MoveStruct({ name: `${$moduleName}::Still`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        /** the character whose moment this is (royalty target, follow-up) */
        character_id: bcs.Address,
        /** Walrus blob id of the image (canonical reference + moment key) */
        walrus_blob_id: bcs.string(),
        /** resolved image url (aggregator) — consumed by Display / wallets */
        image_url: bcs.string(),
        /** 題名, e.g. 「水袖那一夜」 */
        title: bcs.string(),
        edition: bcs.u64()
    } });
export const StillMinted = new MoveStruct({ name: `${$moduleName}::StillMinted`, fields: {
        still_id: bcs.Address,
        saga_id: bcs.Address,
        character_id: bcs.Address,
        moment_key: bcs.string(),
        edition: bcs.u64()
    } });
export const StillMintConfig = new MoveStruct({ name: `${$moduleName}::StillMintConfig`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        /** self-serve fee in ENDLESS base units (currency = 6 decimals) */
        fee: bcs.u64(),
        paused: bcs.bool()
    } });
export const StillMintConfigCreated = new MoveStruct({ name: `${$moduleName}::StillMintConfigCreated`, fields: {
        config_id: bcs.Address,
        saga_id: bcs.Address,
        fee: bcs.u64()
    } });
export const StillMintFeeUpdated = new MoveStruct({ name: `${$moduleName}::StillMintFeeUpdated`, fields: {
        config_id: bcs.Address,
        old_fee: bcs.u64(),
        new_fee: bcs.u64()
    } });
export interface CreateRegistryArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface CreateRegistryOptions {
    package?: string;
    arguments: CreateRegistryArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
/** Create + share the saga's registry (bootstrap, once per saga). */
export function createRegistry(options: CreateRegistryOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'create_registry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetEditionLimitArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    momentKey: RawTransactionArgument<string>;
    limit: RawTransactionArgument<number | bigint>;
}
export interface SetEditionLimitOptions {
    package?: string;
    arguments: SetEditionLimitArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        momentKey: RawTransactionArgument<string>,
        limit: RawTransactionArgument<number | bigint>
    ];
}
/** Curate a 名場面: cap its editions. Must not undercut already-minted count. */
export function setEditionLimit(options: SetEditionLimitOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x1::string::String',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "registry", "momentKey", "limit"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'set_edition_limit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintStillArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    characterId: RawTransactionArgument<string>;
    walrusBlobId: RawTransactionArgument<string>;
    imageUrl: RawTransactionArgument<string>;
    title: RawTransactionArgument<string>;
}
export interface MintStillOptions {
    package?: string;
    arguments: MintStillArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        characterId: RawTransactionArgument<string>,
        walrusBlobId: RawTransactionArgument<string>,
        imageUrl: RawTransactionArgument<string>,
        title: RawTransactionArgument<string>
    ];
}
/**
 * Mint the next edition of a moment. Aborts with `EEditionSoldOut` once a capped
 * moment is fully collected. Returns the Still so the PTB can transfer it to the
 * collector or place it straight into a Kiosk.
 */
export function mintStill(options: MintStillOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::object::ID',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "registry", "characterId", "walrusBlobId", "imageUrl", "title"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'mint_still',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateMintConfigArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    fee: RawTransactionArgument<number | bigint>;
}
export interface CreateMintConfigOptions {
    package?: string;
    arguments: CreateMintConfigArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        fee: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Create + share the self-serve mint config (bootstrap, once per saga). Pass
 * `default_mint_fee()` for the 1 ENDLESS default.
 */
export function createMintConfig(options: CreateMintConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "fee"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'create_mint_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetMintFeeArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    config: RawTransactionArgument<string>;
    newFee: RawTransactionArgument<number | bigint>;
}
export interface SetMintFeeOptions {
    package?: string;
    arguments: SetMintFeeArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        newFee: RawTransactionArgument<number | bigint>
    ];
}
/** Update the self-serve fee (base units). Storyteller-gated. */
export function setMintFee(options: SetMintFeeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "config", "newFee"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'set_mint_fee',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetMintPausedArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    config: RawTransactionArgument<string>;
    paused: RawTransactionArgument<boolean>;
}
export interface SetMintPausedOptions {
    package?: string;
    arguments: SetMintPausedArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        paused: RawTransactionArgument<boolean>
    ];
}
/** Pause / resume the self-serve path (admin path unaffected). Storyteller-gated. */
export function setMintPaused(options: SetMintPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'bool'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "config", "paused"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'set_mint_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintStillPaidArguments {
    config: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    payment: RawTransactionArgument<string>;
    characterId: RawTransactionArgument<string>;
    walrusBlobId: RawTransactionArgument<string>;
    imageUrl: RawTransactionArgument<string>;
    title: RawTransactionArgument<string>;
}
export interface MintStillPaidOptions {
    package?: string;
    arguments: MintStillPaidArguments | [
        config: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        payment: RawTransactionArgument<string>,
        characterId: RawTransactionArgument<string>,
        walrusBlobId: RawTransactionArgument<string>,
        imageUrl: RawTransactionArgument<string>,
        title: RawTransactionArgument<string>
    ];
}
/**
 * Mint the next edition yourself by paying `config.fee` ENDLESS. The fee (not
 * authority) gates it, so no cap is needed. Overpayment flows to the saga treasury
 * — split an exact-fee coin client-side to avoid it. Returns the Still so the PTB
 * transfers it to the buyer.
 */
export function mintStillPaid(options: MintStillPaidOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        '0x2::object::ID',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["config", "saga", "registry", "payment", "characterId", "walrusBlobId", "imageUrl", "title"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'mint_still_paid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface StillIdArguments {
    s: RawTransactionArgument<string>;
}
export interface StillIdOptions {
    package?: string;
    arguments: StillIdArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function stillId(options: StillIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'still_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaIdArguments {
    s: RawTransactionArgument<string>;
}
export interface SagaIdOptions {
    package?: string;
    arguments: SagaIdArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function sagaId(options: SagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CharacterIdArguments {
    s: RawTransactionArgument<string>;
}
export interface CharacterIdOptions {
    package?: string;
    arguments: CharacterIdArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function characterId(options: CharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WalrusBlobIdArguments {
    s: RawTransactionArgument<string>;
}
export interface WalrusBlobIdOptions {
    package?: string;
    arguments: WalrusBlobIdArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function walrusBlobId(options: WalrusBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'walrus_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ImageUrlArguments {
    s: RawTransactionArgument<string>;
}
export interface ImageUrlOptions {
    package?: string;
    arguments: ImageUrlArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function imageUrl(options: ImageUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'image_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TitleArguments {
    s: RawTransactionArgument<string>;
}
export interface TitleOptions {
    package?: string;
    arguments: TitleArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function title(options: TitleOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'title',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EditionArguments {
    s: RawTransactionArgument<string>;
}
export interface EditionOptions {
    package?: string;
    arguments: EditionArguments | [
        s: RawTransactionArgument<string>
    ];
}
export function edition(options: EditionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'edition',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintedCountArguments {
    registry: RawTransactionArgument<string>;
    momentKey: RawTransactionArgument<string>;
}
export interface MintedCountOptions {
    package?: string;
    arguments: MintedCountArguments | [
        registry: RawTransactionArgument<string>,
        momentKey: RawTransactionArgument<string>
    ];
}
/** Editions minted so far for a moment (0 if never minted). */
export function mintedCount(options: MintedCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "momentKey"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'minted_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EditionLimitArguments {
    registry: RawTransactionArgument<string>;
    momentKey: RawTransactionArgument<string>;
}
export interface EditionLimitOptions {
    package?: string;
    arguments: EditionLimitArguments | [
        registry: RawTransactionArgument<string>,
        momentKey: RawTransactionArgument<string>
    ];
}
/** Edition cap for a moment; `none` = open edition. */
export function editionLimit(options: EditionLimitOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "momentKey"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'edition_limit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegistrySagaIdArguments {
    registry: RawTransactionArgument<string>;
}
export interface RegistrySagaIdOptions {
    package?: string;
    arguments: RegistrySagaIdArguments | [
        registry: RawTransactionArgument<string>
    ];
}
export function registrySagaId(options: RegistrySagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'registry_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintFeeArguments {
    config: RawTransactionArgument<string>;
}
export interface MintFeeOptions {
    package?: string;
    arguments: MintFeeArguments | [
        config: RawTransactionArgument<string>
    ];
}
export function mintFee(options: MintFeeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["config"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'mint_fee',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintPausedArguments {
    config: RawTransactionArgument<string>;
}
export interface MintPausedOptions {
    package?: string;
    arguments: MintPausedArguments | [
        config: RawTransactionArgument<string>
    ];
}
export function mintPaused(options: MintPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["config"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'mint_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintConfigSagaIdArguments {
    config: RawTransactionArgument<string>;
}
export interface MintConfigSagaIdOptions {
    package?: string;
    arguments: MintConfigSagaIdArguments | [
        config: RawTransactionArgument<string>
    ];
}
export function mintConfigSagaId(options: MintConfigSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["config"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'mint_config_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DefaultMintFeeOptions {
    package?: string;
    arguments?: [
    ];
}
/** The 1 ENDLESS default for `create_mint_config`. */
export function defaultMintFee(options: DefaultMintFeeOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'still',
        function: 'default_mint_fee',
    });
}