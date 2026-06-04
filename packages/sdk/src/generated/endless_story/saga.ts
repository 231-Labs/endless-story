/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Saga — a narrative arc anchored on a World, run by a Storyteller.
 * 
 * A `Saga` carries:
 * 
 * - identity (kind / name / description / metadata_uri / operator)
 * - economics (`RevenueConfig` owner/storyteller/treasury bps + `treasury`
 *   Balance<CURRENCY>)
 * - coverage (`covered_location_ids` + `anchor_scene_ids`)
 * - LLM hints (`departure_policy` / `nature_prompt` / `rhythm_hints` free-form
 *   text — not enforced on-chain)
 * - per-saga DOF tables: card-weight rules (R3.2) and saga skill defs (R3.3)
 * 
 * **Caps:**
 * 
 * - `StorytellerCap` — saga operator; can cover locations, manage weights, define
 *   skills, withdraw treasury.
 * - World's `AdminCap` (from world.move) — can mark this saga inactive.
 * 
 * **Reincarnation kind** — reserved for sagas that mint essence vouchers from dead
 * characters' memories (a different operational model than Standard narrative
 * sagas). Not exercised in Phase 1 but kept in the enum so future deployments
 * don't need a schema migration.
 * 
 * Phase 1.3 — depends on currency.move (Balance type) + world.move
 * (World/Location/AdminCap).
 */

import { MoveStruct, MoveEnum, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as balance from './deps/sui/balance.js';
const $moduleName = '@local-pkg/endless-story::saga';
export const SAGA = new MoveStruct({ name: `${$moduleName}::SAGA`, fields: {
        dummy_field: bcs.bool()
    } });
export const CardIntentWeight = new MoveStruct({ name: `${$moduleName}::CardIntentWeight`, fields: {
        intent: bcs.u8(),
        attribute_key: bcs.string(),
        bonus_per_point: bcs.u16()
    } });
export const CardWeightTableKey = new MoveStruct({ name: `${$moduleName}::CardWeightTableKey`, fields: {
        dummy_field: bcs.bool()
    } });
export const SagaAttributeDefsKey = new MoveStruct({ name: `${$moduleName}::SagaAttributeDefsKey`, fields: {
        dummy_field: bcs.bool()
    } });
export const SagaResourcesKey = new MoveStruct({ name: `${$moduleName}::SagaResourcesKey`, fields: {
        dummy_field: bcs.bool()
    } });
export const RevenueConfig = new MoveStruct({ name: `${$moduleName}::RevenueConfig`, fields: {
        owner_bps: bcs.u16(),
        storyteller_bps: bcs.u16(),
        treasury_bps: bcs.u16()
    } });
export const StorytellerCap = new MoveStruct({ name: `${$moduleName}::StorytellerCap`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address
    } });
/**
 * Saga categorisation. `Standard` covers user-operated narrative sagas;
 * `Reincarnation` flags a saga whose storyteller mints essence vouchers from dead
 * characters' memories. Multiple Reincarnation sagas may coexist (the project may
 * operate one; third parties may run their own).
 */
export const SagaKind = new MoveEnum({ name: `${$moduleName}::SagaKind`, fields: {
        Standard: null,
        Reincarnation: null
    } });
export const Saga = new MoveStruct({ name: `${$moduleName}::Saga`, fields: {
        id: bcs.Address,
        world_id: bcs.Address,
        kind: SagaKind,
        is_active: bcs.bool(),
        name: bcs.string(),
        description: bcs.string(),
        metadata_uri: bcs.string(),
        operator: bcs.Address,
        revenue_config: RevenueConfig,
        treasury: balance.Balance,
        covered_location_ids: bcs.vector(bcs.Address),
        anchor_scene_ids: bcs.vector(bcs.Address),
        character_count: bcs.u64(),
        /**
         * Free-form natural language departure policy (L1 §4.3). The storyteller LLM reads
         * this to decide how to dramatize a character's leave intent. Move does NOT
         * enforce it on `transfer_character_control`; enforcement is social/reputation.
         */
        departure_policy: bcs.string(),
        /**
         * Per-saga narrative DNA (F — saga soul). Free-form text the character/storyteller
         * LLM layers on top of the genre baseline so different sagas read in distinct
         * voices. Not enforced on-chain. `nature_prompt` = 事件氣質 (conflict type /
         * narrative rhythm); `rhythm_hints` = 自然節律 (dawn warm-up / dusk curtain cues);
         * `portrait_tone` = 畫風 (per-saga portrait art direction, used at recruitment so
         * characters are rendered in this troupe's visual key).
         */
        nature_prompt: bcs.string(),
        rhythm_hints: bcs.string(),
        portrait_tone: bcs.string(),
        created_at_ms: bcs.u64()
    } });
export const SagaCreated = new MoveStruct({ name: `${$moduleName}::SagaCreated`, fields: {
        saga_id: bcs.Address,
        world_id: bcs.Address,
        storyteller_cap_id: bcs.Address,
        kind: SagaKind,
        name: bcs.string(),
        operator: bcs.Address,
        created_at_ms: bcs.u64()
    } });
export const SagaMarkedInactive = new MoveStruct({ name: `${$moduleName}::SagaMarkedInactive`, fields: {
        saga_id: bcs.Address,
        world_id: bcs.Address
    } });
export const AnchorSceneAdded = new MoveStruct({ name: `${$moduleName}::AnchorSceneAdded`, fields: {
        saga_id: bcs.Address,
        scene_id: bcs.Address
    } });
export const LocationCovered = new MoveStruct({ name: `${$moduleName}::LocationCovered`, fields: {
        saga_id: bcs.Address,
        location_id: bcs.Address
    } });
export const DeparturePolicyUpdated = new MoveStruct({ name: `${$moduleName}::DeparturePolicyUpdated`, fields: {
        saga_id: bcs.Address
    } });
export const SagaSoulUpdated = new MoveStruct({ name: `${$moduleName}::SagaSoulUpdated`, fields: {
        saga_id: bcs.Address
    } });
export const CardWeightingEnabled = new MoveStruct({ name: `${$moduleName}::CardWeightingEnabled`, fields: {
        saga_id: bcs.Address
    } });
export const CardWeightingDisabled = new MoveStruct({ name: `${$moduleName}::CardWeightingDisabled`, fields: {
        saga_id: bcs.Address
    } });
export const CardWeightRuleSet = new MoveStruct({ name: `${$moduleName}::CardWeightRuleSet`, fields: {
        saga_id: bcs.Address,
        intent: bcs.u8(),
        attribute_key: bcs.string(),
        bonus_per_point: bcs.u16()
    } });
export const CardWeightRuleCleared = new MoveStruct({ name: `${$moduleName}::CardWeightRuleCleared`, fields: {
        saga_id: bcs.Address,
        intent: bcs.u8(),
        attribute_key: bcs.string()
    } });
export const SagaAttributeDefined = new MoveStruct({ name: `${$moduleName}::SagaAttributeDefined`, fields: {
        saga_id: bcs.Address,
        key: bcs.string()
    } });
export const SagaAttributeCleared = new MoveStruct({ name: `${$moduleName}::SagaAttributeCleared`, fields: {
        saga_id: bcs.Address,
        key: bcs.string()
    } });
export const TreasuryDeposited = new MoveStruct({ name: `${$moduleName}::TreasuryDeposited`, fields: {
        saga_id: bcs.Address,
        amount: bcs.u64(),
        new_balance: bcs.u64()
    } });
export const TreasuryWithdrawn = new MoveStruct({ name: `${$moduleName}::TreasuryWithdrawn`, fields: {
        saga_id: bcs.Address,
        amount: bcs.u64(),
        recipient: bcs.Address,
        new_balance: bcs.u64(),
        withdrawn_at_ms: bcs.u64()
    } });
export interface CreateSagaArguments {
    world: RawTransactionArgument<string>;
    kind: TransactionArgument;
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
    metadataUri: RawTransactionArgument<string>;
    ownerBps: RawTransactionArgument<number>;
    storytellerBps: RawTransactionArgument<number>;
    treasuryBps: RawTransactionArgument<number>;
    coveredLocationIds: RawTransactionArgument<Array<string>>;
    departurePolicy: RawTransactionArgument<string>;
    naturePrompt: RawTransactionArgument<string>;
    rhythmHints: RawTransactionArgument<string>;
    portraitTone: RawTransactionArgument<string>;
}
export interface CreateSagaOptions {
    package?: string;
    arguments: CreateSagaArguments | [
        world: RawTransactionArgument<string>,
        kind: TransactionArgument,
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>,
        metadataUri: RawTransactionArgument<string>,
        ownerBps: RawTransactionArgument<number>,
        storytellerBps: RawTransactionArgument<number>,
        treasuryBps: RawTransactionArgument<number>,
        coveredLocationIds: RawTransactionArgument<Array<string>>,
        departurePolicy: RawTransactionArgument<string>,
        naturePrompt: RawTransactionArgument<string>,
        rhythmHints: RawTransactionArgument<string>,
        portraitTone: RawTransactionArgument<string>
    ];
}
export function createSaga(options: CreateSagaOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String',
        'u16',
        'u16',
        'u16',
        'vector<0x2::object::ID>',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["world", "kind", "name", "description", "metadataUri", "ownerBps", "storytellerBps", "treasuryBps", "coveredLocationIds", "departurePolicy", "naturePrompt", "rhythmHints", "portraitTone"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'create_saga',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MarkSagaInactiveArguments {
    adminCap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface MarkSagaInactiveOptions {
    package?: string;
    arguments: MarkSagaInactiveArguments | [
        adminCap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
/**
 * Flip `Saga.is_active` to false when the world admin retires a saga shell. Caller
 * must still release characters separately (see SagaMarkedInactive doc comment).
 * is_active is a marker only — character/event entry paths do NOT enforce it;
 * enforcement is at the social / runner layer.
 */
export function markSagaInactive(options: MarkSagaInactiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'mark_saga_inactive',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithdrawFromTreasuryArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    recipient: RawTransactionArgument<string>;
}
export interface WithdrawFromTreasuryOptions {
    package?: string;
    arguments: WithdrawFromTreasuryArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        recipient: RawTransactionArgument<string>
    ];
}
/**
 * Storyteller-controlled withdraw from `saga.treasury`. Pulls `amount` base units
 * of ENDLESS, wraps as a Coin, transfers to `recipient`.
 *
 * New in Phase 1.3 (old repo's saga.move had `deposit_to_treasury` with no
 * symmetric withdraw — funds were one-way). Storyteller can now pay out revenue
 * splits / refund subscribers / fund event rewards.
 */
export function withdrawFromTreasury(options: WithdrawFromTreasuryOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'address',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "amount", "recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'withdraw_from_treasury',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TreasuryBalanceArguments {
    saga: RawTransactionArgument<string>;
}
export interface TreasuryBalanceOptions {
    package?: string;
    arguments: TreasuryBalanceArguments | [
        saga: RawTransactionArgument<string>
    ];
}
/** Current treasury balance in ENDLESS base units. View, no cap required. */
export function treasuryBalance(options: TreasuryBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'treasury_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CoverLocationArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    location: RawTransactionArgument<string>;
}
export interface CoverLocationOptions {
    package?: string;
    arguments: CoverLocationArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        location: RawTransactionArgument<string>
    ];
}
/**
 * Storyteller adds a Location to this saga's coverage list. Aborts on duplicate
 * (instead of silent no-op): covering twice usually signals composer drift, easier
 * to debug as an abort.
 */
export function coverLocation(options: CoverLocationOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "location"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'cover_location',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetSagaDeparturePolicyArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    newPolicy: RawTransactionArgument<string>;
}
export interface SetSagaDeparturePolicyOptions {
    package?: string;
    arguments: SetSagaDeparturePolicyArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        newPolicy: RawTransactionArgument<string>
    ];
}
/**
 * Replace this saga's departure policy text. Move does not enforce the policy —
 * it's natural-language guidance for the storyteller LLM. Updating mid-saga is
 * allowed (run different policies in different eras).
 */
export function setSagaDeparturePolicy(options: SetSagaDeparturePolicyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "newPolicy"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'set_saga_departure_policy',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeparturePolicyArguments {
    saga: RawTransactionArgument<string>;
}
export interface DeparturePolicyOptions {
    package?: string;
    arguments: DeparturePolicyArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function departurePolicy(options: DeparturePolicyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'departure_policy',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetSagaSoulArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    naturePrompt: RawTransactionArgument<string>;
    rhythmHints: RawTransactionArgument<string>;
    portraitTone: RawTransactionArgument<string>;
}
export interface SetSagaSoulOptions {
    package?: string;
    arguments: SetSagaSoulArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        naturePrompt: RawTransactionArgument<string>,
        rhythmHints: RawTransactionArgument<string>,
        portraitTone: RawTransactionArgument<string>
    ];
}
/**
 * Replace this saga's narrative-DNA hints (F — saga soul). Like
 * `departure_policy`, these are natural-language guidance for the LLM, not
 * enforced by Move. The soul is read as a unit, so both are set together — pass
 * the current value to leave one unchanged. Updating mid-saga is allowed (run
 * different tonal eras).
 */
export function setSagaSoul(options: SetSagaSoulOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "naturePrompt", "rhythmHints", "portraitTone"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'set_saga_soul',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NaturePromptArguments {
    saga: RawTransactionArgument<string>;
}
export interface NaturePromptOptions {
    package?: string;
    arguments: NaturePromptArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function naturePrompt(options: NaturePromptOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'nature_prompt',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RhythmHintsArguments {
    saga: RawTransactionArgument<string>;
}
export interface RhythmHintsOptions {
    package?: string;
    arguments: RhythmHintsArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function rhythmHints(options: RhythmHintsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'rhythm_hints',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PortraitToneArguments {
    saga: RawTransactionArgument<string>;
}
export interface PortraitToneOptions {
    package?: string;
    arguments: PortraitToneArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function portraitTone(options: PortraitToneOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'portrait_tone',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CoveredLocationCountArguments {
    saga: RawTransactionArgument<string>;
}
export interface CoveredLocationCountOptions {
    package?: string;
    arguments: CoveredLocationCountArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function coveredLocationCount(options: CoveredLocationCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'covered_location_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsLocationCoveredArguments {
    saga: RawTransactionArgument<string>;
    locationId: RawTransactionArgument<string>;
}
export interface IsLocationCoveredOptions {
    package?: string;
    arguments: IsLocationCoveredArguments | [
        saga: RawTransactionArgument<string>,
        locationId: RawTransactionArgument<string>
    ];
}
export function isLocationCovered(options: IsLocationCoveredOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["saga", "locationId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'is_location_covered',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EnableCardWeightingArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface EnableCardWeightingOptions {
    package?: string;
    arguments: EnableCardWeightingArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
/**
 * Attach an empty card-weight rule list as a dynamic field on the saga. Required
 * before any `set_card_weight_rule` call. Aborts if already enabled (composer
 * drift signal — easier to debug than silent no-op).
 */
export function enableCardWeighting(options: EnableCardWeightingOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'enable_card_weighting',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DisableCardWeightingArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface DisableCardWeightingOptions {
    package?: string;
    arguments: DisableCardWeightingArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
/**
 * Detach the card-weight rule list (back to uniform draw). All rules are
 * discarded; no record kept. Aborts if not currently enabled.
 */
export function disableCardWeighting(options: DisableCardWeightingOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'disable_card_weighting',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetCardWeightRuleArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    intent: RawTransactionArgument<number>;
    attributeKey: RawTransactionArgument<string>;
    bonusPerPoint: RawTransactionArgument<number>;
}
export interface SetCardWeightRuleOptions {
    package?: string;
    arguments: SetCardWeightRuleArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        intent: RawTransactionArgument<number>,
        attributeKey: RawTransactionArgument<string>,
        bonusPerPoint: RawTransactionArgument<number>
    ];
}
/**
 * Upsert a rule: replaces any existing rule with the same (intent, attribute_key)
 * tuple, otherwise appends. Aborts if weighting is not enabled.
 */
export function setCardWeightRule(options: SetCardWeightRuleOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u8',
        '0x1::string::String',
        'u16'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "intent", "attributeKey", "bonusPerPoint"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'set_card_weight_rule',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearCardWeightRuleArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    intent: RawTransactionArgument<number>;
    attributeKey: RawTransactionArgument<string>;
}
export interface ClearCardWeightRuleOptions {
    package?: string;
    arguments: ClearCardWeightRuleArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        intent: RawTransactionArgument<number>,
        attributeKey: RawTransactionArgument<string>
    ];
}
/**
 * Remove the (intent, attribute_key) rule if present. No-op (no abort) if the rule
 * wasn't there — safe to call defensively.
 */
export function clearCardWeightRule(options: ClearCardWeightRuleOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u8',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "intent", "attributeKey"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'clear_card_weight_rule',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CardWeightingEnabledArguments {
    saga: RawTransactionArgument<string>;
}
export interface CardWeightingEnabledOptions {
    package?: string;
    arguments: CardWeightingEnabledArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function cardWeightingEnabled(options: CardWeightingEnabledOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'card_weighting_enabled',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CardWeightRulesArguments {
    saga: RawTransactionArgument<string>;
}
export interface CardWeightRulesOptions {
    package?: string;
    arguments: CardWeightRulesArguments | [
        saga: RawTransactionArgument<string>
    ];
}
/**
 * Snapshot the saga's current weight rules. Returns empty vector when card
 * weighting is disabled — callers (e.g. `event::deal_*`) can treat empty ==
 * uniform without a separate predicate.
 */
export function cardWeightRules(options: CardWeightRulesOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'card_weight_rules',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CardWeightIntentArguments {
    rule: TransactionArgument;
}
export interface CardWeightIntentOptions {
    package?: string;
    arguments: CardWeightIntentArguments | [
        rule: TransactionArgument
    ];
}
export function cardWeightIntent(options: CardWeightIntentOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["rule"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'card_weight_intent',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CardWeightAttributeKeyArguments {
    rule: TransactionArgument;
}
export interface CardWeightAttributeKeyOptions {
    package?: string;
    arguments: CardWeightAttributeKeyArguments | [
        rule: TransactionArgument
    ];
}
export function cardWeightAttributeKey(options: CardWeightAttributeKeyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["rule"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'card_weight_attribute_key',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CardWeightBonusPerPointArguments {
    rule: TransactionArgument;
}
export interface CardWeightBonusPerPointOptions {
    package?: string;
    arguments: CardWeightBonusPerPointArguments | [
        rule: TransactionArgument
    ];
}
export function cardWeightBonusPerPoint(options: CardWeightBonusPerPointOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["rule"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'card_weight_bonus_per_point',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DefineSagaAttributeArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    key: RawTransactionArgument<string>;
    label: RawTransactionArgument<string>;
    minValue: RawTransactionArgument<number | bigint>;
    maxValue: RawTransactionArgument<number | bigint>;
}
export interface DefineSagaAttributeOptions {
    package?: string;
    arguments: DefineSagaAttributeArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        key: RawTransactionArgument<string>,
        label: RawTransactionArgument<string>,
        minValue: RawTransactionArgument<number | bigint>,
        maxValue: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Append a new saga-specific attribute definition. The table is auto-attached on
 * first call. Aborts if `key` is already defined (for the same saga) so
 * storytellers can't accidentally redefine what a skill range means mid-game.
 */
export function defineSagaAttribute(options: DefineSagaAttributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x1::string::String',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "key", "label", "minValue", "maxValue"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'define_saga_attribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearSagaAttributeArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    key: RawTransactionArgument<string>;
}
export interface ClearSagaAttributeOptions {
    package?: string;
    arguments: ClearSagaAttributeArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        key: RawTransactionArgument<string>
    ];
}
/**
 * Remove a saga-specific attribute definition by key. No-op if missing. Note: this
 * does NOT clear existing character skills keyed under the removed name — those
 * become stale data on chain (still readable, just no longer enforced or
 * weighted).
 */
export function clearSagaAttribute(options: ClearSagaAttributeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'clear_saga_attribute',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaAttributeDefsArguments {
    saga: RawTransactionArgument<string>;
}
export interface SagaAttributeDefsOptions {
    package?: string;
    arguments: SagaAttributeDefsArguments | [
        saga: RawTransactionArgument<string>
    ];
}
/**
 * Snapshot of saga's own attribute definitions (empty if none).
 * `event::compute_card_weights` and `character::set_character_skill` both look
 * here when validating / resolving an attribute key.
 */
export function sagaAttributeDefs(options: SagaAttributeDefsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'saga_attribute_defs',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaResourceIdsArguments {
    saga: RawTransactionArgument<string>;
}
export interface SagaResourceIdsOptions {
    package?: string;
    arguments: SagaResourceIdsArguments | [
        saga: RawTransactionArgument<string>
    ];
}
/**
 * Snapshot of the saga's registered resource ids (empty if none). Off-chain reads
 * this to discover the saga's contested resources without replaying
 * ResourceInstantiated events.
 */
export function sagaResourceIds(options: SagaResourceIdsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'saga_resource_ids',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VerifyCapArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface VerifyCapOptions {
    package?: string;
    arguments: VerifyCapArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
export function verifyCap(options: VerifyCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'verify_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertCapArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
}
export interface AssertCapOptions {
    package?: string;
    arguments: AssertCapArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>
    ];
}
export function assertCap(options: AssertCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'assert_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaIdArguments {
    saga: RawTransactionArgument<string>;
}
export interface SagaIdOptions {
    package?: string;
    arguments: SagaIdArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function sagaId(options: SagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WorldIdArguments {
    saga: RawTransactionArgument<string>;
}
export interface WorldIdOptions {
    package?: string;
    arguments: WorldIdArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function worldId(options: WorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CharacterCountArguments {
    saga: RawTransactionArgument<string>;
}
export interface CharacterCountOptions {
    package?: string;
    arguments: CharacterCountArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function characterCount(options: CharacterCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'character_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaKindArguments {
    saga: RawTransactionArgument<string>;
}
export interface SagaKindOptions {
    package?: string;
    arguments: SagaKindArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function sagaKind(options: SagaKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'saga_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsActiveArguments {
    saga: RawTransactionArgument<string>;
}
export interface IsActiveOptions {
    package?: string;
    arguments: IsActiveArguments | [
        saga: RawTransactionArgument<string>
    ];
}
export function isActive(options: IsActiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["saga"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'is_active',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface KindStandardOptions {
    package?: string;
    arguments?: [
    ];
}
export function kindStandard(options: KindStandardOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'kind_standard',
    });
}
export interface KindReincarnationOptions {
    package?: string;
    arguments?: [
    ];
}
export function kindReincarnation(options: KindReincarnationOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'kind_reincarnation',
    });
}
export interface NewRevenueConfigArguments {
    ownerBps: RawTransactionArgument<number>;
    storytellerBps: RawTransactionArgument<number>;
    treasuryBps: RawTransactionArgument<number>;
}
export interface NewRevenueConfigOptions {
    package?: string;
    arguments: NewRevenueConfigArguments | [
        ownerBps: RawTransactionArgument<number>,
        storytellerBps: RawTransactionArgument<number>,
        treasuryBps: RawTransactionArgument<number>
    ];
}
export function newRevenueConfig(options: NewRevenueConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u16',
        'u16',
        'u16'
    ] satisfies (string | null)[];
    const parameterNames = ["ownerBps", "storytellerBps", "treasuryBps"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'saga',
        function: 'new_revenue_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}