/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Recruitment — voucher-driven character mint.
 * 
 * Two-step recruitment flow:
 * 
 * 1.  **Mint voucher**: any address pays ENDLESS into a Saga's treasury via
 *     `mint_genesis_voucher`. Receives a `GenesisVoucher` object (transferrable,
 *     expires after TTL).
 * 2.  **Redeem voucher**: the voucher holder hands it to the saga's storyteller,
 *     who co-signs `redeem_voucher_to_character`. The Character + OwnerCap +
 *     ControlCap are minted; voucher is consumed. Owner_recipient is fixed to
 *     `voucher.payer` — storyteller cannot redirect ownership.
 * 
 * **Design rationale**: separating the payment step from the mint step lets the
 * off-chain generator preview character stats from `attribute_seed` before the
 * storyteller commits. If the preview is rejected, the voucher can be left to
 * expire (refund mechanic — Phase 2; for now, ENDLESS sits in the saga treasury as
 * the cost of preview).
 * 
 * **Phase 1.5a (prior)** shipped voucher half. **Phase 1.5b (now)** adds the
 * wild→saga `JoinIntent` flow: owner of a wild character mints a shared
 * `JoinIntent` pointing at a target saga; storyteller of that saga consumes it via
 * `accept_character_into_saga`.
 * 
 * See AGENTS.md → 「鏈上架構」.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::recruit';
export const RECRUIT = new MoveStruct({ name: `${$moduleName}::RECRUIT`, fields: {
        dummy_field: bcs.bool()
    } });
export const VoucherRequirements = new MoveStruct({ name: `${$moduleName}::VoucherRequirements`, fields: {
        allowed_genders: bcs.vector(bcs.string()),
        allowed_species: bcs.vector(bcs.string()),
        min_age: bcs.u8(),
        max_age: bcs.u8(),
        required_attribute_keys: bcs.vector(bcs.string()),
        required_attribute_mins: bcs.vector(bcs.u64())
    } });
export const GenesisVoucher = new MoveStruct({ name: `${$moduleName}::GenesisVoucher`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        payer: bcs.Address,
        paid_amount: bcs.u64(),
        attribute_seed: bcs.vector(bcs.u8()),
        hint: bcs.option(bcs.string()),
        requirements: VoucherRequirements,
        intent_hint: bcs.option(bcs.string()),
        minted_at_ms: bcs.u64(),
        expires_at_ms: bcs.u64()
    } });
export const GenesisVoucherMinted = new MoveStruct({ name: `${$moduleName}::GenesisVoucherMinted`, fields: {
        voucher_id: bcs.Address,
        saga_id: bcs.Address,
        payer: bcs.Address,
        paid_amount: bcs.u64(),
        expires_at_ms: bcs.u64(),
        /**
         * Caller-supplied tag (e.g. off-chain recruitment id) so indexers can group
         * vouchers by their originating campaign without reading the voucher object.
         */
        hint: bcs.option(bcs.string()),
        /** Natural-language role intent. Echoed in event for the same indexing convenience. */
        intent_hint: bcs.option(bcs.string())
    } });
export const GenesisVoucherRedeemed = new MoveStruct({ name: `${$moduleName}::GenesisVoucherRedeemed`, fields: {
        voucher_id: bcs.Address,
        saga_id: bcs.Address,
        character_id: bcs.Address,
        redeemed_at_ms: bcs.u64(),
        /**
         * Carried over from the consumed voucher so capacity-tracking can be done by
         * joining MintedEvent ∩ RedeemedEvent on `voucher_id`, then aggregating by `hint`.
         * Without this, the voucher object is destroyed before redeem-time readers can see
         * the hint.
         */
        hint: bcs.option(bcs.string()),
        intent_hint: bcs.option(bcs.string())
    } });
export const JoinIntent = new MoveStruct({ name: `${$moduleName}::JoinIntent`, fields: {
        id: bcs.Address,
        character_id: bcs.Address,
        target_saga_id: bcs.Address,
        expires_at_ms: bcs.u64(),
        minted_at_ms: bcs.u64()
    } });
export const JoinIntentMinted = new MoveStruct({ name: `${$moduleName}::JoinIntentMinted`, fields: {
        intent_id: bcs.Address,
        character_id: bcs.Address,
        target_saga_id: bcs.Address,
        expires_at_ms: bcs.u64()
    } });
export const JoinIntentConsumed = new MoveStruct({ name: `${$moduleName}::JoinIntentConsumed`, fields: {
        intent_id: bcs.Address,
        character_id: bcs.Address,
        target_saga_id: bcs.Address,
        consumed_at_ms: bcs.u64()
    } });
export const JoinIntentRevoked = new MoveStruct({ name: `${$moduleName}::JoinIntentRevoked`, fields: {
        intent_id: bcs.Address,
        character_id: bcs.Address
    } });
export interface NoRequirementsOptions {
    package?: string;
    arguments?: [
    ];
}
/** "No restrictions" — typical for permissionless recruit vouchers. */
export function noRequirements(options: NoRequirementsOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'no_requirements',
    });
}
export interface NewVoucherRequirementsArguments {
    allowedGenders: RawTransactionArgument<Array<string>>;
    allowedSpecies: RawTransactionArgument<Array<string>>;
    minAge: RawTransactionArgument<number>;
    maxAge: RawTransactionArgument<number>;
    requiredAttributeKeys: RawTransactionArgument<Array<string>>;
    requiredAttributeMins: RawTransactionArgument<Array<number | bigint>>;
}
export interface NewVoucherRequirementsOptions {
    package?: string;
    arguments: NewVoucherRequirementsArguments | [
        allowedGenders: RawTransactionArgument<Array<string>>,
        allowedSpecies: RawTransactionArgument<Array<string>>,
        minAge: RawTransactionArgument<number>,
        maxAge: RawTransactionArgument<number>,
        requiredAttributeKeys: RawTransactionArgument<Array<string>>,
        requiredAttributeMins: RawTransactionArgument<Array<number | bigint>>
    ];
}
/**
 * Construct a VoucherRequirements value. Asserts parallel-vector length parity so
 * the caller can't accidentally feed mismatched (keys, mins).
 */
export function newVoucherRequirements(options: NewVoucherRequirementsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<0x1::string::String>',
        'vector<0x1::string::String>',
        'u8',
        'u8',
        'vector<0x1::string::String>',
        'vector<u64>'
    ] satisfies (string | null)[];
    const parameterNames = ["allowedGenders", "allowedSpecies", "minAge", "maxAge", "requiredAttributeKeys", "requiredAttributeMins"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'new_voucher_requirements',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CheckVoucherRequirementsArguments {
    voucher: RawTransactionArgument<string>;
    profile: TransactionArgument;
    attributes: TransactionArgument;
}
export interface CheckVoucherRequirementsOptions {
    package?: string;
    arguments: CheckVoucherRequirementsArguments | [
        voucher: RawTransactionArgument<string>,
        profile: TransactionArgument,
        attributes: TransactionArgument
    ];
}
/**
 * Pure view: does the proposed (profile, attributes) satisfy
 * `voucher.requirements`? Frontends/SDK should call this before signing redeem to
 * avoid wasting gas on assertions. Returns false on any failed check.
 */
export function checkVoucherRequirements(options: CheckVoucherRequirementsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["voucher", "profile", "attributes"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'check_voucher_requirements',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintGenesisVoucherArguments {
    saga: RawTransactionArgument<string>;
    payment: RawTransactionArgument<string>;
    attributeSeed: RawTransactionArgument<Array<number>>;
    hint: RawTransactionArgument<string | null>;
    requirements: TransactionArgument;
    intentHint: RawTransactionArgument<string | null>;
    ttlMs: RawTransactionArgument<number | bigint>;
}
export interface MintGenesisVoucherOptions {
    package?: string;
    arguments: MintGenesisVoucherArguments | [
        saga: RawTransactionArgument<string>,
        payment: RawTransactionArgument<string>,
        attributeSeed: RawTransactionArgument<Array<number>>,
        hint: RawTransactionArgument<string | null>,
        requirements: TransactionArgument,
        intentHint: RawTransactionArgument<string | null>,
        ttlMs: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Pay ENDLESS into the saga treasury; receive a `GenesisVoucher`. Payer =
 * ctx.sender(). Storyteller does NOT need to sign this step — vouchers are
 * permissionlessly mintable as long as you can pay.
 *
 * `requirements`: structured constraints enforced on redeem. Pass
 * `no_requirements()` if any character is acceptable. `intent_hint`: optional
 * natural-language role intent ("武小生").
 */
export function mintGenesisVoucher(options: MintGenesisVoucherOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        '0x1::option::Option<0x1::string::String>',
        null,
        '0x1::option::Option<0x1::string::String>',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["saga", "payment", "attributeSeed", "hint", "requirements", "intentHint", "ttlMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'mint_genesis_voucher',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RedeemVoucherToCharacterArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    world: RawTransactionArgument<string>;
    scene: RawTransactionArgument<string>;
    voucher: RawTransactionArgument<string>;
    profile: TransactionArgument;
    mediaAssets: TransactionArgument;
    attributes: TransactionArgument;
}
export interface RedeemVoucherToCharacterOptions {
    package?: string;
    arguments: RedeemVoucherToCharacterArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        world: RawTransactionArgument<string>,
        scene: RawTransactionArgument<string>,
        voucher: RawTransactionArgument<string>,
        profile: TransactionArgument,
        mediaAssets: TransactionArgument,
        attributes: TransactionArgument
    ];
}
/**
 * Storyteller co-signs to mint the actual Character, consuming the voucher.
 * `owner_recipient` is **fixed** to `voucher.payer` — the person who paid is the
 * only legitimate owner of the resulting Character. Storyteller cannot redirect
 * ownership.
 *
 * Aborts if voucher's saga != target saga, or if voucher expired, or if
 * world/scene don't match the saga (sanity), or if profile/attributes fail
 * `character::mint_character_internal`'s validation.
 */
export function redeemVoucherToCharacter(options: RedeemVoucherToCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        null,
        'vector<null>',
        'vector<null>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "world", "scene", "voucher", "profile", "mediaAssets", "attributes"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'redeem_voucher_to_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherSagaIdArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherSagaIdOptions {
    package?: string;
    arguments: VoucherSagaIdArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherSagaId(options: VoucherSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherPayerArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherPayerOptions {
    package?: string;
    arguments: VoucherPayerArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherPayer(options: VoucherPayerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_payer',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherPaidAmountArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherPaidAmountOptions {
    package?: string;
    arguments: VoucherPaidAmountArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherPaidAmount(options: VoucherPaidAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_paid_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherAttributeSeedArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherAttributeSeedOptions {
    package?: string;
    arguments: VoucherAttributeSeedArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherAttributeSeed(options: VoucherAttributeSeedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_attribute_seed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherHintArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherHintOptions {
    package?: string;
    arguments: VoucherHintArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherHint(options: VoucherHintOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_hint',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherMintedAtMsArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherMintedAtMsOptions {
    package?: string;
    arguments: VoucherMintedAtMsArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherMintedAtMs(options: VoucherMintedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_minted_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherExpiresAtMsArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherExpiresAtMsOptions {
    package?: string;
    arguments: VoucherExpiresAtMsArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherExpiresAtMs(options: VoucherExpiresAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_expires_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherRequirementsArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherRequirementsOptions {
    package?: string;
    arguments: VoucherRequirementsArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherRequirements(options: VoucherRequirementsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_requirements',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VoucherIntentHintArguments {
    voucher: RawTransactionArgument<string>;
}
export interface VoucherIntentHintOptions {
    package?: string;
    arguments: VoucherIntentHintArguments | [
        voucher: RawTransactionArgument<string>
    ];
}
export function voucherIntentHint(options: VoucherIntentHintOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["voucher"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'voucher_intent_hint',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReqsAllowedGendersArguments {
    reqs: TransactionArgument;
}
export interface ReqsAllowedGendersOptions {
    package?: string;
    arguments: ReqsAllowedGendersArguments | [
        reqs: TransactionArgument
    ];
}
export function reqsAllowedGenders(options: ReqsAllowedGendersOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reqs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'reqs_allowed_genders',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReqsAllowedSpeciesArguments {
    reqs: TransactionArgument;
}
export interface ReqsAllowedSpeciesOptions {
    package?: string;
    arguments: ReqsAllowedSpeciesArguments | [
        reqs: TransactionArgument
    ];
}
export function reqsAllowedSpecies(options: ReqsAllowedSpeciesOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reqs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'reqs_allowed_species',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReqsMinAgeArguments {
    reqs: TransactionArgument;
}
export interface ReqsMinAgeOptions {
    package?: string;
    arguments: ReqsMinAgeArguments | [
        reqs: TransactionArgument
    ];
}
export function reqsMinAge(options: ReqsMinAgeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reqs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'reqs_min_age',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReqsMaxAgeArguments {
    reqs: TransactionArgument;
}
export interface ReqsMaxAgeOptions {
    package?: string;
    arguments: ReqsMaxAgeArguments | [
        reqs: TransactionArgument
    ];
}
export function reqsMaxAge(options: ReqsMaxAgeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reqs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'reqs_max_age',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReqsRequiredAttributeKeysArguments {
    reqs: TransactionArgument;
}
export interface ReqsRequiredAttributeKeysOptions {
    package?: string;
    arguments: ReqsRequiredAttributeKeysArguments | [
        reqs: TransactionArgument
    ];
}
export function reqsRequiredAttributeKeys(options: ReqsRequiredAttributeKeysOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reqs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'reqs_required_attribute_keys',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReqsRequiredAttributeMinsArguments {
    reqs: TransactionArgument;
}
export interface ReqsRequiredAttributeMinsOptions {
    package?: string;
    arguments: ReqsRequiredAttributeMinsArguments | [
        reqs: TransactionArgument
    ];
}
export function reqsRequiredAttributeMins(options: ReqsRequiredAttributeMinsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["reqs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'reqs_required_attribute_mins',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RequestJoinSagaArguments {
    ownerCap: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    targetSagaId: RawTransactionArgument<string>;
    ttlMs: RawTransactionArgument<number | bigint>;
}
export interface RequestJoinSagaOptions {
    package?: string;
    arguments: RequestJoinSagaArguments | [
        ownerCap: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        targetSagaId: RawTransactionArgument<string>,
        ttlMs: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Owner publishes a shared JoinIntent offering this wild character to a specific
 * saga. Owner-signed; shares the intent object so any storyteller of
 * `target_saga_id` can pick it up.
 *
 * Caller responsibility: confirm `character.state.saga_id == None` before calling
 * (the assertion inside enforces this — wild only).
 */
export function requestJoinSaga(options: RequestJoinSagaOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["ownerCap", "character", "targetSagaId", "ttlMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'request_join_saga',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeJoinIntentArguments {
    ownerCap: RawTransactionArgument<string>;
    intent: RawTransactionArgument<string>;
}
export interface RevokeJoinIntentOptions {
    package?: string;
    arguments: RevokeJoinIntentArguments | [
        ownerCap: RawTransactionArgument<string>,
        intent: RawTransactionArgument<string>
    ];
}
/**
 * Owner takes back an unused JoinIntent. Validates ownership; consumes the intent
 * (key-only shared object burned by-value).
 */
export function revokeJoinIntent(options: RevokeJoinIntentOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["ownerCap", "intent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'revoke_join_intent',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AcceptCharacterIntoSagaArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    targetScene: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    intent: RawTransactionArgument<string>;
}
export interface AcceptCharacterIntoSagaOptions {
    package?: string;
    arguments: AcceptCharacterIntoSagaArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        targetScene: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        intent: RawTransactionArgument<string>
    ];
}
/**
 * Saga storyteller consumes a JoinIntent to take custody of a wild character.
 * Dual-sign: `cap` proves authority over the target saga; `intent` proves owner
 * consent for THIS saga. Pulls the ControlCap out of the character's DOF (set
 * during `release_character_to_wild`), rebinds its `saga_id`, returns the cap to
 * the storyteller. Character placed in `target_scene`.
 *
 * Aborts on: intent saga mismatch, intent character mismatch, intent expired,
 * target_scene in different saga, character no longer wild, character dead.
 */
export function acceptCharacterIntoSaga(options: AcceptCharacterIntoSagaOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "targetScene", "character", "intent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'accept_character_into_saga',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IntentCharacterIdArguments {
    intent: RawTransactionArgument<string>;
}
export interface IntentCharacterIdOptions {
    package?: string;
    arguments: IntentCharacterIdArguments | [
        intent: RawTransactionArgument<string>
    ];
}
export function intentCharacterId(options: IntentCharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["intent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'intent_character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IntentTargetSagaIdArguments {
    intent: RawTransactionArgument<string>;
}
export interface IntentTargetSagaIdOptions {
    package?: string;
    arguments: IntentTargetSagaIdArguments | [
        intent: RawTransactionArgument<string>
    ];
}
export function intentTargetSagaId(options: IntentTargetSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["intent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'intent_target_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IntentMintedAtMsArguments {
    intent: RawTransactionArgument<string>;
}
export interface IntentMintedAtMsOptions {
    package?: string;
    arguments: IntentMintedAtMsArguments | [
        intent: RawTransactionArgument<string>
    ];
}
export function intentMintedAtMs(options: IntentMintedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["intent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'intent_minted_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IntentExpiresAtMsArguments {
    intent: RawTransactionArgument<string>;
}
export interface IntentExpiresAtMsOptions {
    package?: string;
    arguments: IntentExpiresAtMsArguments | [
        intent: RawTransactionArgument<string>
    ];
}
export function intentExpiresAtMs(options: IntentExpiresAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["intent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'recruit',
        function: 'intent_expires_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}